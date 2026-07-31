import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

import { SpotifyMock, createDefaultState, type MockState } from '../test/spotifyMock.js';

/**
 * Parcours de qualification des titres likés.
 *
 * Vérifie la promesse centrale de la fonctionnalité : un titre traité ne
 * réapparaît plus, **y compris après redémarrage du backend** — c'est tout
 * l'intérêt de la persistance sur disque.
 */

let app: FastifyInstance;
let mock: SpotifyMock;
let state: MockState;
let dataDir: string;

async function login(): Promise<string> {
  const loginResponse = await app.inject({ method: 'GET', url: '/api/auth/login' });
  const stateCookie = loginResponse.cookies.find((c) => c.name === 'overtify_oauth_state');
  const stateParam = new URL(loginResponse.headers.location as string).searchParams.get('state');

  const callback = await app.inject({
    method: 'GET',
    url: `/api/auth/callback?code=fake&state=${stateParam ?? ''}`,
    cookies: { overtify_oauth_state: stateCookie?.value ?? '' },
  });

  return callback.cookies.find((c) => c.name === 'overtify_session')?.value ?? '';
}

/**
 * Simule un redémarrage complet du backend.
 *
 * Recréer l'application ne suffit pas : le store est un singleton dont le
 * cache mémoire survivrait, et le test passerait même sans écriture disque.
 * On vide donc explicitement le cache pour forcer une relecture du fichier —
 * c'est ce que fait un vrai redémarrage de processus.
 */
async function restartApp(): Promise<void> {
  await app.close();

  const { qualificationStore } = await import('../services/qualificationStore.js');
  qualificationStore.clearCache();

  const { buildApp } = await import('../app.js');
  app = await buildApp();
  await app.ready();
}

beforeEach(async () => {
  // Répertoire de données isolé par test : aucun état ne fuit entre les cas.
  dataDir = join(tmpdir(), `overtify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  process.env.OVERTIFY_DATA_DIR = dataDir;

  state = createDefaultState();
  mock = new SpotifyMock(state);
  mock.start();

  // Le cache d'index est un singleton : sans purge, l'état d'un test
  // précédent fuirait dans le suivant.
  const { libraryCache } = await import('../services/libraryCache.js');
  libraryCache.clear();

  const { buildApp } = await import('../app.js');
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await mock.stop();
  await rm(dataDir, { recursive: true, force: true });
});

describe('Qualification : file d’attente', () => {
  it('propose les titres likés non encore traités', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(200);

    const queue = response.json();
    expect(queue.totalLiked).toBe(2);
    expect(queue.remainingCount).toBe(2);
    expect(queue.qualifiedCount).toBe(0);
    expect(queue.tracks).toHaveLength(2);
  });

  it('propose les playlists possédées comme destinations', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    const names = response.json().playlists.map((p: { name: string }) => p.name);

    // Celle d'un autre utilisateur n'est pas une destination valide.
    expect(names).toContain('Ma playlist');
    expect(names).not.toContain("Playlist d'un autre");
  });

  it('exige une session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/qualification/queue' });

    expect(response.statusCode).toBe(401);
  });
});

describe('Qualification : ranger un titre', () => {
  it('ajoute le titre aux playlists choisies', async () => {
    const session = await login();
    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().addedTo).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
    expect(state.playlists[0]?.tracks).toHaveLength(before + 1);
  });

  /** Non destructif : le titre reste dans les likés après avoir été rangé. */
  it('conserve le titre dans les likés', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    expect(state.likedSongs).toHaveLength(2);
    expect(state.likedSongs.some((t) => t.uri === 'spotify:track:ffffffffffffffffffffff')).toBe(
      true,
    );
  });

  it('retire le titre traité de la file', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    const queue = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(queue.json().remainingCount).toBe(1);
    expect(queue.json().qualifiedCount).toBe(1);
    expect(queue.json().tracks.some((t: { uri: string }) => t.uri.endsWith('ffffff'))).toBe(false);
  });

  it('accepte plusieurs playlists de destination', async () => {
    const session = await login();

    // Une seconde playlist possédée, pour tester l'ajout multiple.
    state.playlists.push({
      id: 'cccccccccccccccccccccc',
      name: 'Seconde',
      ownerId: 'moi',
      tracks: [],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccccccccc'],
      },
    });

    expect(response.json().addedTo).toHaveLength(2);
    expect(state.playlists.find((p) => p.id === 'cccccccccccccccccccccc')?.tracks).toHaveLength(1);
  });

  it('rejette un URI invalide', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: { uri: 'pas-un-uri', playlistIds: [] },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Qualification : passer un titre', () => {
  /** « Passer » marque traité sans rien modifier côté Spotify. */
  it('marque le titre traité sans l’ajouter nulle part', async () => {
    const session = await login();
    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: { uri: 'spotify:track:ffffffffffffffffffffff', playlistIds: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().addedTo).toEqual([]);
    expect(state.playlists[0]?.tracks).toHaveLength(before);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(queue.json().qualifiedCount).toBe(1);
  });
});

describe('Qualification : persistance', () => {
  /**
   * Le cœur de la fonctionnalité : la mémoire survit à un redémarrage.
   * Sans cela, un tri étalé sur plusieurs séances serait perdu.
   */
  it('conserve la progression après redémarrage du backend', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: { uri: 'spotify:track:ffffffffffffffffffffff', playlistIds: [] },
    });

    await restartApp();

    // Les sessions sont en mémoire : il faut se reconnecter, mais la
    // progression de qualification doit avoir survécu.
    const newSession = await login();

    const queue = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: newSession },
    });

    expect(queue.json().qualifiedCount).toBe(1);
    expect(queue.json().remainingCount).toBe(1);
  });
});

describe('Qualification : annulation et réinitialisation', () => {
  it('annule une décision, le titre revient dans la file', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: { uri: 'spotify:track:ffffffffffffffffffffff', playlistIds: [] },
    });

    const undo = await app.inject({
      method: 'POST',
      url: '/api/qualification/undo',
      cookies: { overtify_session: session },
      payload: { uri: 'spotify:track:ffffffffffffffffffffff' },
    });

    expect(undo.statusCode).toBe(204);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(queue.json().remainingCount).toBe(2);
  });

  it('réinitialise toute la progression', async () => {
    const session = await login();

    for (const uri of [
      'spotify:track:ffffffffffffffffffffff',
      'spotify:track:gggggggggggggggggggggg',
    ]) {
      await app.inject({
        method: 'POST',
        url: '/api/qualification/qualify',
        cookies: { overtify_session: session },
        payload: { uri, playlistIds: [] },
      });
    }

    const reset = await app.inject({
      method: 'POST',
      url: '/api/qualification/reset',
      cookies: { overtify_session: session },
    });

    expect(reset.statusCode).toBe(204);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(queue.json().qualifiedCount).toBe(0);
    expect(queue.json().remainingCount).toBe(2);
  });

  /** La réinitialisation ne touche aucune donnée Spotify. */
  it('ne modifie ni les likés ni les playlists', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    const likedBefore = state.likedSongs.length;
    const playlistBefore = state.playlists[0]?.tracks.length ?? 0;

    await app.inject({
      method: 'POST',
      url: '/api/qualification/reset',
      cookies: { overtify_session: session },
    });

    expect(state.likedSongs).toHaveLength(likedBefore);
    expect(state.playlists[0]?.tracks).toHaveLength(playlistBefore);
  });
});

describe('Qualification : appartenance aux playlists', () => {
  /**
   * L'interface pré-coche les playlists contenant déjà le titre. Encore
   * faut-il que le serveur les indique.
   */
  it('signale les playlists contenant déjà le titre', async () => {
    const session = await login();

    // On place un liké dans une playlist possédée.
    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    const tracks = response.json().tracks as Array<{ uri: string; inPlaylistIds: string[] }>;
    const target = tracks.find((t) => t.uri === 'spotify:track:ffffffffffffffffffffff');

    expect(target?.inPlaylistIds).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('renvoie une liste vide pour un titre rangé nulle part', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    const tracks = response.json().tracks as Array<{ inPlaylistIds: string[] }>;

    expect(tracks.every((t) => t.inPlaylistIds.length === 0)).toBe(true);
  });

  /**
   * Garde-fou central : valider une case pré-cochée ne doit jamais créer un
   * doublon strict — ce que l'application sert précisément à éliminer.
   */
  it('ne réajoute pas un titre déjà présent', async () => {
    const session = await login();

    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().addedTo).toEqual([]);
    expect(response.json().skipped).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);

    // Aucun doublon créé.
    expect(state.playlists[0]?.tracks).toHaveLength(before);
  });

  it('ajoute aux nouvelles playlists sans dupliquer dans les anciennes', async () => {
    const session = await login();

    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    state.playlists.push({
      id: 'cccccccccccccccccccccc',
      name: 'Nouvelle',
      ownerId: 'moi',
      tracks: [],
    });

    const beforeExisting = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccccccccc'],
      },
    });

    expect(response.json().addedTo).toEqual(['cccccccccccccccccccccc']);
    expect(response.json().skipped).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);

    expect(state.playlists[0]?.tracks).toHaveLength(beforeExisting);
    expect(state.playlists.find((p) => p.id === 'cccccccccccccccccccccc')?.tracks).toHaveLength(1);
  });
});
