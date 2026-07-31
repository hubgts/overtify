import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { libraryCache } from '../services/libraryCache.js';
import { SpotifyMock, createDefaultState, type MockState } from '../test/spotifyMock.js';

/**
 * Vue « où est ce morceau ? ».
 *
 * Deux garanties à tenir : l'index reflète bien l'appartenance réelle, et le
 * cache ne sert jamais un état périmé après une modification.
 */

let app: FastifyInstance;
let mock: SpotifyMock;
let state: MockState;

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

/** Compte les requêtes Spotify émises, pour vérifier l'effet du cache. */
function spotifyCallCount(): number {
  return state.requests.length;
}

beforeEach(async () => {
  state = createDefaultState();
  mock = new SpotifyMock(state);
  mock.start();
  libraryCache.clear();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await mock.stop();
});

describe('Bibliothèque : index', () => {
  it('recense les morceaux avec leurs emplacements', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(200);

    const index = response.json();
    expect(index.entries.length).toBeGreaterThan(0);
    expect(index.playlists).toHaveLength(1);
    expect(index.likedCount).toBe(2);
  });

  it('indique les titres likés comme emplacement', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{
      uri: string;
      locations: Array<{ playlistId: string }>;
    }>;

    const liked = entries.find((e) => e.uri === 'spotify:track:ffffffffffffffffffffff');

    expect(liked?.locations.map((l) => l.playlistId)).toContain('liked-songs');
  });

  /** Le cas d'usage central : un morceau présent à plusieurs endroits. */
  it('regroupe les emplacements multiples d’un même morceau', async () => {
    const session = await login();

    // Le même titre, liké ET dans une playlist.
    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/library?refresh=true',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{
      uri: string;
      locations: Array<{ playlistId: string }>;
    }>;

    const entry = entries.find((e) => e.uri === 'spotify:track:ffffffffffffffffffffff');
    const places = entry?.locations.map((l) => l.playlistId) ?? [];

    expect(places).toContain('liked-songs');
    expect(places).toContain('aaaaaaaaaaaaaaaaaaaaaa');
    expect(entry?.locations).toHaveLength(2);
  });

  it('exige une session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/library' });

    expect(response.statusCode).toBe(401);
  });
});

describe('Bibliothèque : cache', () => {
  it('sert le second appel sans requête Spotify supplémentaire', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const afterFirst = spotifyCallCount();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    expect(spotifyCallCount()).toBe(afterFirst);
  });

  it('reconstruit l’index sur demande explicite', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const afterFirst = spotifyCallCount();

    await app.inject({
      method: 'GET',
      url: '/api/library?refresh=true',
      cookies: { overtify_session: session },
    });

    expect(spotifyCallCount()).toBeGreaterThan(afterFirst);
  });

  /**
   * Garantie critique : après une modification, l'index ne doit plus refléter
   * l'état d'avant. Sans invalidation, la vue mentirait.
   */
  it('est invalidé après un ajout de morceau', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'POST',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: session },
      payload: { uris: ['spotify:track:eeeeeeeeeeeeeeeeeeeeee'] },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{ uri: string }>;

    expect(entries.some((e) => e.uri === 'spotify:track:eeeeeeeeeeeeeeeeeeeeee')).toBe(true);
  });

  it('est invalidé après une suppression', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const detail = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: session },
      payload: {
        tracks: [{ uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', position: 1 }],
        snapshotId: detail.json().snapshotId,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{
      uri: string;
      locations: Array<{ playlistId: string }>;
    }>;

    const removed = entries.find((e) => e.uri === 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb');
    const stillInPlaylist = removed?.locations.some(
      (l) => l.playlistId === 'aaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(stillInPlaylist ?? false).toBe(false);
  });

  it('est invalidé après une qualification', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'POST',
      url: '/api/qualification/qualify',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{
      uri: string;
      locations: Array<{ playlistId: string }>;
    }>;

    const entry = entries.find((e) => e.uri === 'spotify:track:ffffffffffffffffffffff');

    expect(entry?.locations.map((l) => l.playlistId)).toContain('aaaaaaaaaaaaaaaaaaaaaa');
  });
});

describe('Bibliothèque : gestion de l’appartenance', () => {
  /** Périmètre explicite : seules ces playlists peuvent être touchées. */
  const scope = ['aaaaaaaaaaaaaaaaaaaaaa'];

  it('ajoute le morceau aux playlists cochées', async () => {
    const session = await login();
    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
        scopePlaylistIds: scope,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().addedTo).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
    expect(response.json().removedFrom).toEqual([]);
    expect(state.playlists[0]?.tracks).toHaveLength(before + 1);
  });

  /** Le comportement nouveau : décocher retire réellement. */
  it('retire le morceau des playlists décochées', async () => {
    const session = await login();

    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: [],
        scopePlaylistIds: scope,
      },
    });

    expect(response.json().removedFrom).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
    expect(state.playlists[0]?.tracks).toHaveLength(before - 1);
    expect(
      state.playlists[0]?.tracks.some((t) => t.uri === 'spotify:track:ffffffffffffffffffffff'),
    ).toBe(false);
  });

  it('ne touche pas une playlist déjà dans l’état voulu', async () => {
    const session = await login();

    state.playlists[0]?.tracks.push({
      uri: 'spotify:track:ffffffffffffffffffffff',
      name: 'Idioteque',
      artist: 'Radiohead',
    });

    const before = state.playlists[0]?.tracks.length ?? 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
        scopePlaylistIds: scope,
      },
    });

    expect(response.json().addedTo).toEqual([]);
    expect(response.json().removedFrom).toEqual([]);
    expect(response.json().skipped).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
    expect(state.playlists[0]?.tracks).toHaveLength(before);
  });

  it('combine ajout et retrait en une opération', async () => {
    const session = await login();

    state.playlists.push({
      id: 'cccccccccccccccccccccc',
      name: 'Seconde',
      ownerId: 'moi',
      tracks: [
        { uri: 'spotify:track:ffffffffffffffffffffff', name: 'Idioteque', artist: 'Radiohead' },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        // Voulu dans la première, plus dans la seconde.
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
        scopePlaylistIds: ['aaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccccccccc'],
      },
    });

    expect(response.json().addedTo).toEqual(['aaaaaaaaaaaaaaaaaaaaaa']);
    expect(response.json().removedFrom).toEqual(['cccccccccccccccccccccc']);
    expect(state.playlists.find((p) => p.id === 'cccccccccccccccccccccc')?.tracks).toHaveLength(0);
  });

  /**
   * Garde-fou : une playlist hors périmètre n'est jamais touchée, même absente
   * de `playlistIds`. Sans cela, un client partiel provoquerait des retraits
   * silencieux.
   */
  it('laisse intactes les playlists hors périmètre', async () => {
    const session = await login();

    state.playlists.push({
      id: 'cccccccccccccccccccccc',
      name: 'Hors périmètre',
      ownerId: 'moi',
      tracks: [
        { uri: 'spotify:track:ffffffffffffffffffffff', name: 'Idioteque', artist: 'Radiohead' },
      ],
    });

    await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: [],
        scopePlaylistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
      },
    });

    expect(state.playlists.find((p) => p.id === 'cccccccccccccccccccccc')?.tracks).toHaveLength(1);
  });

  it('retire toutes les occurrences d’un doublon', async () => {
    const session = await login();

    for (let i = 0; i < 2; i += 1) {
      state.playlists[0]?.tracks.push({
        uri: 'spotify:track:ffffffffffffffffffffff',
        name: 'Idioteque',
        artist: 'Radiohead',
      });
    }

    await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: [],
        scopePlaylistIds: scope,
      },
    });

    expect(
      state.playlists[0]?.tracks.filter(
        (t) => t.uri === 'spotify:track:ffffffffffffffffffffff',
      ),
    ).toHaveLength(0);
  });

  it('refuse une playlist appartenant à un autre', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['bbbbbbbbbbbbbbbbbbbbbb'],
        scopePlaylistIds: ['bbbbbbbbbbbbbbbbbbbbbb'],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuse un périmètre vide', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: [],
        scopePlaylistIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('invalide l’index après l’opération', async () => {
    const session = await login();

    await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
        scopePlaylistIds: scope,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/library',
      cookies: { overtify_session: session },
    });

    const entries = response.json().entries as Array<{
      uri: string;
      locations: Array<{ playlistId: string }>;
    }>;
    const entry = entries.find((e) => e.uri === 'spotify:track:ffffffffffffffffffffff');

    expect(entry?.locations.map((l) => l.playlistId)).toContain('aaaaaaaaaaaaaaaaaaaaaa');
  });

  /** L'opération est ponctuelle : la progression du tri reste intacte. */
  it('ne marque pas le titre comme qualifié', async () => {
    const session = await login();

    const before = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'POST',
      url: '/api/library/sync',
      cookies: { overtify_session: session },
      payload: {
        uri: 'spotify:track:ffffffffffffffffffffff',
        playlistIds: ['aaaaaaaaaaaaaaaaaaaaaa'],
        scopePlaylistIds: scope,
      },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/api/qualification/queue',
      cookies: { overtify_session: session },
    });

    expect(after.json().qualifiedCount).toBe(before.json().qualifiedCount);
  });
});
