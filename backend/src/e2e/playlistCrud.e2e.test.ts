import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

import { libraryCache } from '../services/libraryCache.js';
import { clearRemovedCache } from '../services/removedPlaylistStore.js';
import { SpotifyMock, createDefaultState, type MockState } from '../test/spotifyMock.js';

/**
 * CRUD des playlists.
 *
 * Point sensible : Spotify n'offre aucune suppression réelle. Le « retrait »
 * est un désabonnement, et l'application doit rester capable de proposer la
 * restauration — c'est ce que ces tests vérifient.
 */

let app: FastifyInstance;
let mock: SpotifyMock;
let state: MockState;
let dataDir: string;

async function login(): Promise<string> {
  const r = await app.inject({ method: 'GET', url: '/api/auth/login' });
  const c = r.cookies.find((x) => x.name === 'overtify_oauth_state');
  const st = new URL(r.headers.location as string).searchParams.get('state');

  const cb = await app.inject({
    method: 'GET',
    url: `/api/auth/callback?code=f&state=${st ?? ''}`,
    cookies: { overtify_oauth_state: c?.value ?? '' },
  });

  return cb.cookies.find((x) => x.name === 'overtify_session')?.value ?? '';
}

beforeEach(async () => {
  dataDir = join(tmpdir(), `overtify-crud-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  process.env.OVERTIFY_DATA_DIR = dataDir;

  state = createDefaultState();
  mock = new SpotifyMock(state);
  mock.start();
  libraryCache.clear();
  clearRemovedCache();

  const { buildApp } = await import('../app.js');
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await mock.stop();
  await rm(dataDir, { recursive: true, force: true });
});

describe('Playlists : création', () => {
  it('crée une playlist et la renvoie', async () => {
    const session = await login();
    const before = state.playlists.length;

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { overtify_session: session },
      payload: { name: 'Nouvelle playlist' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe('Nouvelle playlist');
    expect(state.playlists).toHaveLength(before + 1);
  });

  /** Spotify crée en public par défaut ; Overtify préfère l'inverse. */
  it('crée en privé par défaut', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { overtify_session: session },
      payload: { name: 'Privée' },
    });

    const created = state.requests.find((r) => r.path === '/me/playlists');
    expect((created?.body as { public: boolean }).public).toBe(false);
  });

  it('utilise /me/playlists et jamais /users/{id}/playlists', async () => {
    const session = await login();

    await app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { overtify_session: session },
      payload: { name: 'X' },
    });

    const paths = state.requests.map((r) => r.path);
    expect(paths).toContain('/me/playlists');
    expect(paths.some((p) => p.startsWith('/users/'))).toBe(false);
  });

  it('refuse un nom vide', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { overtify_session: session },
      payload: { name: '   ' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('exige une session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      payload: { name: 'X' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('Playlists : modification', () => {
  it('renomme une playlist', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
      payload: { name: 'Renommée' },
    });

    expect(response.statusCode).toBe(204);
    expect(state.playlists[0]?.name).toBe('Renommée');
  });

  it('refuse une modification vide', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuse de modifier la playlist d’un autre', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/playlists/bbbbbbbbbbbbbbbbbbbbbb',
      cookies: { overtify_session: session },
      payload: { name: 'Piratée' },
    });

    expect(response.statusCode).toBe(403);
  });

  /** Les Titres likés sont une pseudo-playlist : ni renommables ni retirables. */
  it('refuse de modifier les Titres likés', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/playlists/liked-songs',
      cookies: { overtify_session: session },
      payload: { name: 'Autre nom' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Playlists : retrait et restauration', () => {
  it('retire la playlist de la bibliothèque', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(204);
    expect(state.playlists[0]?.unfollowed).toBe(true);

    // Elle disparaît de la liste des playlists suivies.
    const list = await app.inject({
      method: 'GET',
      url: '/api/playlists',
      cookies: { overtify_session: session },
    });

    const names = list.json().map((p: { name: string }) => p.name);
    expect(names).not.toContain('Ma playlist');
  });

  /**
   * Le retrait passe par un désabonnement, jamais par une suppression : c'est
   * ce qui rend l'action réversible.
   */
  it('se désabonne au lieu de supprimer', async () => {
    const session = await login();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    const paths = state.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('DELETE /playlists/aaaaaaaaaaaaaaaaaaaaaa/followers');
  });

  it('mémorise la playlist retirée pour pouvoir la réafficher', async () => {
    const session = await login();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    const removed = await app.inject({
      method: 'GET',
      url: '/api/playlists/removed',
      cookies: { overtify_session: session },
    });

    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toHaveLength(1);
    expect(removed.json()[0]).toMatchObject({
      id: 'aaaaaaaaaaaaaaaaaaaaaa',
      name: 'Ma playlist',
    });
  });

  it('restaure une playlist retirée', async () => {
    const session = await login();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/restore',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(204);
    expect(state.playlists[0]?.unfollowed).toBe(false);

    // Elle sort de la corbeille et réapparaît dans la bibliothèque.
    const removed = await app.inject({
      method: 'GET',
      url: '/api/playlists/removed',
      cookies: { overtify_session: session },
    });

    expect(removed.json()).toHaveLength(0);
  });

  /** Le contenu doit survivre au retrait, sinon la restauration serait vaine. */
  it('conserve les morceaux pendant le retrait', async () => {
    const session = await login();
    const before = state.playlists[0]?.tracks.length ?? 0;

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    await app.inject({
      method: 'POST',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa/restore',
      cookies: { overtify_session: session },
    });

    expect(state.playlists[0]?.tracks).toHaveLength(before);
  });

  it('refuse de retirer la playlist d’un autre', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/bbbbbbbbbbbbbbbbbbbbbb',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuse de retirer les Titres likés', async () => {
    const session = await login();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/playlists/liked-songs',
      cookies: { overtify_session: session },
    });

    expect(response.statusCode).toBe(400);
  });

  it('la corbeille survit à un redémarrage', async () => {
    const session = await login();

    await app.inject({
      method: 'DELETE',
      url: '/api/playlists/aaaaaaaaaaaaaaaaaaaaaa',
      cookies: { overtify_session: session },
    });

    await app.close();
    clearRemovedCache();

    const { buildApp } = await import('../app.js');
    app = await buildApp();
    await app.ready();

    const newSession = await login();

    const removed = await app.inject({
      method: 'GET',
      url: '/api/playlists/removed',
      cookies: { overtify_session: newSession },
    });

    expect(removed.json()).toHaveLength(1);
  });
});
