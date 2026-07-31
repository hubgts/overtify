import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { SpotifyMock, createDefaultState, type MockState } from '../test/spotifyMock.js';

/**
 * Tests de bout en bout des parcours utilisateur.
 *
 * L'application complète est montée (routes, plugins, sessions, client HTTP) et
 * interrogée comme le ferait le navigateur ; seule l'API Spotify est simulée.
 * Un test qui passe ici garantit que la chaîne entière fonctionne — c'est ce
 * qui manquait quand la migration d'endpoint Spotify est passée inaperçue.
 */

let app: FastifyInstance;
let mock: SpotifyMock;
let state: MockState;

/** Effectue le parcours OAuth et retourne le cookie de session. */
async function login(): Promise<string> {
  const loginResponse = await app.inject({ method: 'GET', url: '/api/auth/login' });
  expect(loginResponse.statusCode).toBe(302);

  const stateCookie = loginResponse.cookies.find(
    (cookie) => cookie.name === 'overtify_oauth_state',
  );
  expect(stateCookie).toBeDefined();

  // Le `state` renvoyé par Spotify doit correspondre à celui du cookie.
  const authorizeUrl = new URL(loginResponse.headers.location as string);
  const stateParam = authorizeUrl.searchParams.get('state');

  const callbackResponse = await app.inject({
    method: 'GET',
    url: `/api/auth/callback?code=fake-code&state=${stateParam ?? ''}`,
    cookies: { overtify_oauth_state: stateCookie?.value ?? '' },
  });

  expect(callbackResponse.statusCode).toBe(302);

  const sessionCookie = callbackResponse.cookies.find(
    (cookie) => cookie.name === 'overtify_session',
  );
  expect(sessionCookie?.value).toBeTruthy();

  return sessionCookie?.value ?? '';
}

beforeEach(async () => {
  state = createDefaultState();
  mock = new SpotifyMock(state);
  mock.start();

  // Le cache d'index est un singleton : sans purge, l'état d'un test
  // précédent fuirait dans le suivant.
  const { libraryCache } = await import('../services/libraryCache.js');
  libraryCache.clear();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await mock.stop();
});

describe('Parcours : authentification', () => {
  it('redirige vers Spotify avec les bons scopes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const location = new URL(response.headers.location as string);

    expect(location.origin).toBe('https://accounts.spotify.com');
    expect(location.searchParams.get('response_type')).toBe('code');

    const scopes = (location.searchParams.get('scope') ?? '').split(' ');

    expect(scopes).toEqual([
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-library-modify',
    ]);
  });

  /**
   * Moindre privilège : chaque scope superflu allonge l'écran de consentement
   * et élargit les droits accordés. Ce test empêche d'en réintroduire un sans
   * usage — `user-read-email` avait été demandé sans jamais être utilisé.
   */
  it('ne demande aucun scope inutilisé', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const scopes = new URL(response.headers.location as string).searchParams.get('scope') ?? '';

    expect(scopes).not.toContain('user-read-email');
    expect(scopes).not.toContain('user-read-private');
    expect(scopes).not.toContain('user-read-playback');
    expect(scopes).not.toContain('user-top-read');
  });

  it('refuse un callback dont le state ne correspond pas', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=x&state=forge',
      cookies: { overtify_oauth_state: 'autre-valeur' },
    });

    // Redirection vers le front avec un motif d'erreur, sans créer de session.
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('auth=error');
    expect(
      response.cookies.find((cookie) => cookie.name === 'overtify_session'),
    ).toBeUndefined();
  });

  it('crée une session et expose le profil', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 'moi', displayName: 'Moi' });
  });

  it('refuse l’accès aux playlists sans session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/playlists' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('détruit la session à la déconnexion', async () => {
    const sessionCookie = await login();

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { overtify_session: sessionCookie },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('Parcours : consultation des playlists', () => {
  it('liste uniquement les playlists possédées', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);

    const playlists = response.json() as Array<{ id: string; name: string }>;

    // Titres likés + la playlist possédée ; celle d'un autre est exclue.
    expect(playlists).toHaveLength(2);
    expect(playlists.map((playlist) => playlist.name)).toEqual([
      'Titres likés',
      'Ma playlist',
    ]);
    expect(playlists.some((playlist) => playlist.name === "Playlist d'un autre")).toBe(false);
  });

  /** Régression : le compteur venait de `items`, pas de `tracks`. */
  it('affiche le bon nombre de morceaux', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists',
      cookies: { overtify_session: sessionCookie },
    });

    const playlists = response.json() as Array<{ id: string; trackCount: number }>;
    const owned = playlists.find((playlist) => playlist.id === 'aaaaaaaaaaaaaaaaaaaaaa');

    expect(owned?.trackCount).toBe(4);
  });

  it('charge le détail avec tous les morceaux et leurs positions', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);

    const detail = response.json();
    expect(detail.tracks).toHaveLength(4);
    expect(detail.tracks.map((track: { position: number }) => track.position)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(detail.tracks[0]).toMatchObject({ name: 'Creep', artists: ['Radiohead'] });
  });

  /**
   * Régression majeure : Spotify a retiré `/playlists/{id}/tracks` le
   * 11 février 2026 au profit de `/items`. Le simulateur renvoie 403 sur
   * l'ancien chemin, donc ce test échoue si le code y revient.
   */
  it('utilise l’endpoint /items et jamais /tracks', async () => {
    const sessionCookie = await login();

    await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    const spotifyPaths = state.requests.map((request) => request.path);

    expect(spotifyPaths).toContain('/playlists/aaaaaaaaaaaaaaaaaaaaaa/items');
    expect(spotifyPaths.some((path) => path.endsWith('/tracks'))).toBe(false);
  });

  it('refuse le détail d’une playlist appartenant à un autre', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists/bbbbbbbbbbbbbbbbbbbbbb',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});

describe('Parcours : ajout d’un morceau', () => {
  it('recherche puis ajoute un morceau à la playlist', async () => {
    const sessionCookie = await login();

    const searchResponse = await app.inject({
      method: 'GET',
      url: '/api/search/tracks?q=no%20surprises',
      cookies: { overtify_session: sessionCookie },
    });

    expect(searchResponse.statusCode).toBe(200);

    const foundUri = searchResponse.json().tracks[0].uri;

    const addResponse = await app.inject({
      method: 'POST',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: { uris: [foundUri] },
    });

    expect(addResponse.statusCode).toBe(200);
    expect(addResponse.json().snapshotId).toBeTruthy();

    // Le morceau est réellement présent après l'opération.
    const detail = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    expect(detail.json().tracks).toHaveLength(5);
    expect(detail.json().tracks[4].name).toBe('No Surprises');
  });

  it('rejette un URI invalide', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: { uris: ['pas-un-uri'] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuse l’ajout dans la playlist d’un autre', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists/bbbbbbbbbbbbbbbbbbbbbb/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: { uris: ['spotify:track:eeeeeeeeeeeeeeeeeeeeee'] },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('Parcours : suppression', () => {
  it('retire une occurrence précise sans toucher aux autres', async () => {
    const sessionCookie = await login();

    const before = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    const snapshotId = before.json().snapshotId;

    // Position 2 = seconde occurrence de « Creep ».
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [{ uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', position: 2 }],
        snapshotId,
      },
    });

    expect(response.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    const names = after.json().tracks.map((track: { name: string }) => track.name);

    // La première occurrence de Creep est conservée.
    expect(names).toEqual(['Creep', 'Karma Police', 'Karma Police - Remastered 2016']);
  });

  it('transmet le snapshotId à Spotify', async () => {
    const sessionCookie = await login();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [{ uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', position: 0 }],
        snapshotId: 'snapshot-attendu',
      },
    });

    const deleteRequest = state.requests.find((request) => request.method === 'DELETE');
    expect((deleteRequest?.body as { snapshot_id: string }).snapshot_id).toBe(
      'snapshot-attendu',
    );
  });

  it('rejette deux suppressions sur la même position', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [
          { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', position: 1 },
          { uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', position: 1 },
        ],
        snapshotId: 'snapshot-1',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Parcours : dédoublonnage complet', () => {
  /**
   * Le parcours central du produit, de bout en bout : charger la playlist,
   * détecter les doublons, supprimer les occisions en trop, vérifier le
   * résultat réel.
   *
   * La détection vit côté frontend ; on reproduit ici sa décision (retirer la
   * seconde occurrence stricte) pour valider la chaîne backend.
   */
  it('supprime le doublon strict et conserve une occurrence', async () => {
    const sessionCookie = await login();

    const detail = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    const tracks = detail.json().tracks as Array<{ uri: string; position: number }>;

    // Occurrences en trop : même URI déjà vu plus tôt dans la playlist.
    const seen = new Set<string>();
    const duplicates = tracks.filter((track) => {
      if (seen.has(track.uri)) {
        return true;
      }
      seen.add(track.uri);
      return false;
    });

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.position).toBe(2);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: duplicates.map((track) => ({ uri: track.uri, position: track.position })),
        snapshotId: detail.json().snapshotId,
      },
    });

    expect(response.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    const remaining = after.json().tracks as Array<{ uri: string }>;
    const creepCount = remaining.filter(
      (track) => track.uri === 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
    ).length;

    expect(creepCount).toBe(1);
    expect(remaining).toHaveLength(3);
  });

  it('supprime plusieurs occurrences en une seule opération', async () => {
    const sessionCookie = await login();

    const detail = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    // Positions 2 (doublon strict) et 3 (doublon probable).
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [
          { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', position: 2 },
          { uri: 'spotify:track:cccccccccccccccccccccc', position: 3 },
        ],
        snapshotId: detail.json().snapshotId,
      },
    });

    expect(response.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: sessionCookie },
    });

    expect(after.json().tracks).toHaveLength(2);
  });
});

describe('Parcours : Titres likés', () => {
  /**
   * Les Titres likés sont présentés comme une playlist, mais s'appuient sur
   * `/me/tracks` : endpoints, scopes et sémantique de suppression distincts.
   */
  it('apparaissent en tête de la liste des playlists', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists',
      cookies: { overtify_session: sessionCookie },
    });

    const playlists = response.json();

    expect(playlists[0]).toMatchObject({ id: 'liked-songs', name: 'Titres likés' });
    expect(playlists[0].trackCount).toBe(2);
  });

  it('chargent leurs morceaux depuis /me/tracks', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/api/playlists/liked-songs',
      cookies: { overtify_session: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tracks).toHaveLength(2);
    expect(state.requests.some((request) => request.path === '/me/tracks')).toBe(true);
  });

  it('ajoutent un morceau via PUT /me/tracks', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists/liked-songs/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: { uris: ['spotify:track:eeeeeeeeeeeeeeeeeeeeee'] },
    });

    expect(response.statusCode).toBe(200);

    const putRequest = state.requests.find((request) => request.method === 'PUT');
    // Spotify attend des identifiants nus, pas des URI complets.
    expect((putRequest?.body as { ids: string[] }).ids).toEqual([
      'eeeeeeeeeeeeeeeeeeeeee',
    ]);
    expect(state.likedSongs).toHaveLength(3);
  });

  it('suppriment par identifiant, sans notion de position', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/liked-songs/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [{ uri: 'spotify:track:gggggggggggggggggggggg', position: 1 }],
        snapshotId: '',
      },
    });

    expect(response.statusCode).toBe(200);

    const deleteRequest = state.requests.find(
      (request) => request.method === 'DELETE' && request.path === '/me/tracks',
    );
    expect((deleteRequest?.body as { ids: string[] }).ids).toEqual([
      'gggggggggggggggggggggg',
    ]);
    expect(state.likedSongs).toHaveLength(1);
  });

  /** Régression : un snapshotId vide est légitime ici, contrairement aux playlists. */
  it('acceptent un snapshotId vide', async () => {
    const sessionCookie = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/liked-songs/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [{ uri: 'spotify:track:ffffffffffffffffffffff', position: 0 }],
        snapshotId: '',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('dédoublonnage : retire la réédition et conserve l’originale', async () => {
    const sessionCookie = await login();

    const detail = await app.inject({
      method: 'GET',
      url: '/api/playlists/liked-songs',
      cookies: { overtify_session: sessionCookie },
    });

    const tracks = detail.json().tracks as Array<{ uri: string; name: string; position: number }>;
    const remaster = tracks.find((track) => track.name.includes('Remastered'));

    expect(remaster).toBeDefined();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/liked-songs/tracks',
      cookies: { overtify_session: sessionCookie },
      payload: {
        tracks: [{ uri: remaster?.uri ?? '', position: remaster?.position ?? 0 }],
        snapshotId: '',
      },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/api/playlists/liked-songs',
      cookies: { overtify_session: sessionCookie },
    });

    const names = after.json().tracks.map((track: { name: string }) => track.name);
    expect(names).toEqual(['Idioteque']);
  });
});
