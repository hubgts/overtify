import { MockAgent, fetch as undiciFetch } from 'undici';

import { resetFetchImplementation, setFetchImplementation } from '../utils/httpClient.js';

/**
 * Serveur Spotify simulé pour les tests de bout en bout.
 *
 * Intercepte les appels HTTP sortants, ce qui permet de jouer des parcours
 * complets (connexion, lecture, ajout, suppression, dédoublonnage) sans réseau
 * ni compte réel — donc de façon déterministe et reproductible.
 *
 * Le simulateur reproduit fidèlement deux comportements de l'API réelle :
 *  - l'ancien chemin `/tracks` répond 403 (retiré le 11 février 2026) ;
 *  - `/items` est le chemin valide.
 * Sans cela, un test passerait alors que la production échoue.
 */

export interface MockTrack {
  uri: string;
  name: string;
  artist: string;
  album?: string;
  durationMs?: number;
}

export interface MockPlaylist {
  id: string;
  name: string;
  ownerId: string;
  snapshotId?: string;
  tracks: MockTrack[];
  /** Désabonnée : absente de /me/playlists, mais toujours lisible par id. */
  unfollowed?: boolean;
}

export interface MockState {
  userId: string;
  displayName: string;
  playlists: MockPlaylist[];
  /** Morceaux renvoyés par la recherche. */
  searchResults: MockTrack[];
  /** Titres likés (`/me/tracks`) : collection sans doublon possible. */
  likedSongs: MockTrack[];
  /** Journal des requêtes reçues, pour les assertions. */
  requests: Array<{ method: string; path: string; body?: unknown }>;
}

function toApiTrack(track: MockTrack) {
  return {
    id: track.uri.split(':').pop(),
    uri: track.uri,
    name: track.name,
    duration_ms: track.durationMs ?? 200_000,
    is_local: false,
    artists: [{ id: 'artist1', name: track.artist }],
    album: {
      id: 'album1',
      name: track.album ?? 'Album',
      images: [{ url: 'https://img/640.jpg', height: 640, width: 640 }],
    },
  };
}

function toApiPlaylist(playlist: MockPlaylist) {
  return {
    id: playlist.id,
    name: playlist.name,
    description: null,
    images: [{ url: 'https://img/300.jpg', height: 300, width: 300 }],
    owner: { id: playlist.ownerId, display_name: playlist.ownerId },
    public: true,
    collaborative: false,
    snapshot_id: playlist.snapshotId ?? 'snapshot-1',
    // Reproduit la forme réelle de /me/playlists : le compteur est sous `items`.
    items: { total: playlist.tracks.length },
  };
}

export class SpotifyMock {
  private readonly agent = new MockAgent();

  constructor(readonly state: MockState) {}

  /** Active l'interception. À appeler avant chaque test. */
  start(): void {
    this.agent.disableNetConnect();

    // Le `fetch` global de Node embarque sa propre copie d'undici, insensible
    // à setGlobalDispatcher. On injecte donc explicitement le fetch d'undici
    // rattaché à notre agent simulé.
    setFetchImplementation(((input, init) =>
      undiciFetch(input as string, { ...init, dispatcher: this.agent } as never)) as typeof fetch);

    this.registerAccountsRoutes();
    this.registerApiRoutes();
  }

  /** Restaure le dispatcher d'origine. */
  async stop(): Promise<void> {
    resetFetchImplementation();
    await this.agent.close();
  }

  private record(method: string, path: string, body?: unknown): void {
    this.state.requests.push({ method, path, ...(body === undefined ? {} : { body }) });
  }

  private registerAccountsRoutes(): void {
    const accounts = this.agent.get('https://accounts.spotify.com');

    accounts
      // `body: () => true` accepte n'importe quel corps : sans cela, undici
      // compare le corps encodé et l'intercepteur ne correspond jamais.
      .intercept({ path: '/api/token', method: 'POST', body: () => true })
      .reply(200, {
        access_token: 'fake-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        scope: 'playlist-read-private playlist-modify-public playlist-modify-private',
      })
      .persist();
  }

  private registerApiRoutes(): void {
    const api = this.agent.get('https://api.spotify.com');

    // --- CRUD playlists ---------------------------------------------------
    api
      .intercept({ path: /^\/v1\/me\/playlists$/, method: 'POST', body: () => true })
      .reply(({ body }) => {
        const parsed = JSON.parse(String(body)) as { name: string; public?: boolean };
        this.record('POST', '/me/playlists', parsed);

        const created = {
          id: `new${String(this.state.playlists.length).padStart(19, '0')}`,
          name: parsed.name,
          ownerId: this.state.userId,
          tracks: [],
        };

        this.state.playlists.push(created);
        return { statusCode: 201, data: toApiPlaylist(created) };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+$/, method: 'PUT', body: () => true })
      .reply(({ path, body }) => {
        const playlistId = this.extractPlaylistId(path);
        const parsed = JSON.parse(String(body)) as { name?: string };
        this.record('PUT', `/playlists/${playlistId}`, parsed);

        const playlist = this.findPlaylist(playlistId);

        if (playlist === undefined) {
          return { statusCode: 404, data: { error: { status: 404, message: 'Not found' } } };
        }

        if (parsed.name !== undefined) {
          playlist.name = parsed.name;
        }

        return { statusCode: 200, data: '' };
      })
      .persist();

    // Spotify n'offre pas de suppression : on se désabonne de la playlist,
    // qui disparaît de /me/playlists tout en restant restaurable.
    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/followers$/, method: 'DELETE' })
      .reply(({ path }) => {
        const playlistId = this.extractPlaylistId(path);
        this.record('DELETE', `/playlists/${playlistId}/followers`);

        const playlist = this.findPlaylist(playlistId);

        if (playlist !== undefined) {
          playlist.unfollowed = true;
        }

        // Spotify répond 200 avec un corps VIDE : reproduire `{}` masquerait
        // le crash de JSON.parse observé en production.
        return { statusCode: 200, data: '' };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/followers$/, method: 'PUT', body: () => true })
      .reply(({ path }) => {
        const playlistId = this.extractPlaylistId(path);
        this.record('PUT', `/playlists/${playlistId}/followers`);

        const playlist = this.findPlaylist(playlistId);

        if (playlist !== undefined) {
          playlist.unfollowed = false;
        }

        return { statusCode: 200, data: '' };
      })
      .persist();

    // --- Titres likés -----------------------------------------------------
    api
      .intercept({ path: /^\/v1\/me\/tracks/, method: 'GET' })
      .reply(200, () => {
        this.record('GET', '/me/tracks');
        return {
          items: this.state.likedSongs.map((track) => ({
            added_at: '2024-01-01T00:00:00Z',
            item: toApiTrack(track),
          })),
          total: this.state.likedSongs.length,
          limit: 50,
          offset: 0,
          next: null,
        };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/me\/tracks/, method: 'PUT', body: () => true })
      .reply(({ body }) => {
        const parsed = JSON.parse(String(body)) as { ids: string[] };
        this.record('PUT', '/me/tracks', parsed);

        for (const id of parsed.ids) {
          const uri = `spotify:track:${id}`;
          // Unicité garantie par Spotify : un like n'est jamais dupliqué.
          if (!this.state.likedSongs.some((track) => track.uri === uri)) {
            const known = this.state.searchResults.find((track) => track.uri === uri);
            this.state.likedSongs.push(known ?? { uri, name: 'Liké', artist: 'Artiste' });
          }
        }

        return { statusCode: 200, data: {} };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/me\/tracks/, method: 'DELETE', body: () => true })
      .reply(({ body }) => {
        const parsed = JSON.parse(String(body)) as { ids: string[] };
        this.record('DELETE', '/me/tracks', parsed);

        const toRemove = new Set(parsed.ids.map((id) => `spotify:track:${id}`));
        this.state.likedSongs = this.state.likedSongs.filter(
          (track) => !toRemove.has(track.uri),
        );

        return { statusCode: 200, data: {} };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/me$/, method: 'GET' })
      .reply(200, () => {
        this.record('GET', '/me');
        return { id: this.state.userId, display_name: this.state.displayName, images: [] };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/me\/playlists/, method: 'GET' })
      .reply(200, () => {
        this.record('GET', '/me/playlists');
        const followed = this.state.playlists.filter((playlist) => !playlist.unfollowed);

        return {
          items: followed.map(toApiPlaylist),
          total: followed.length,
          limit: 50,
          offset: 0,
          next: null,
        };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/search/, method: 'GET' })
      .reply(200, () => {
        this.record('GET', '/search');
        return {
          tracks: {
            items: this.state.searchResults.map(toApiTrack),
            total: this.state.searchResults.length,
            limit: 20,
            offset: 0,
            next: null,
          },
        };
      })
      .persist();

    /**
     * Ancien chemin, retiré par Spotify en février 2026.
     *
     * Reproduire ce 403 est essentiel : c'est ce qui fait échouer un test si
     * le code régresse vers l'endpoint obsolète.
     */
    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/tracks/, method: 'GET' })
      .reply(403, { error: { status: 403, message: 'Forbidden' } })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/items/, method: 'GET' })
      .reply(({ path }) => {
        const playlistId = this.extractPlaylistId(path);
        this.record('GET', `/playlists/${playlistId}/items`);

        const playlist = this.findPlaylist(playlistId);

        if (playlist === undefined) {
          return { statusCode: 404, data: { error: { status: 404, message: 'Not found' } } };
        }

        return {
          statusCode: 200,
          data: {
            // `/items` imbrique la piste sous `item` ; `track` est déprécié.
            // Reproduire la forme réelle est indispensable : avec l'ancienne
            // clé, un code fautif passerait les tests et échouerait en vrai.
            items: playlist.tracks.map((track) => ({
              added_at: '2024-01-01T00:00:00Z',
              is_local: false,
              item: toApiTrack(track),
            })),
            total: playlist.tracks.length,
            limit: 50,
            offset: 0,
            next: null,
          },
        };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+$/, method: 'GET' })
      .reply(({ path }) => {
        const playlistId = this.extractPlaylistId(path);
        this.record('GET', `/playlists/${playlistId}`);

        const playlist = this.findPlaylist(playlistId);

        if (playlist === undefined) {
          return { statusCode: 404, data: { error: { status: 404, message: 'Not found' } } };
        }

        return { statusCode: 200, data: toApiPlaylist(playlist) };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/items/, method: 'POST' })
      .reply(({ path, body }) => {
        const playlistId = this.extractPlaylistId(path);
        const parsed = JSON.parse(String(body)) as { uris: string[] };
        this.record('POST', `/playlists/${playlistId}/items`, parsed);

        const playlist = this.findPlaylist(playlistId);

        if (playlist === undefined) {
          return { statusCode: 404, data: { error: { status: 404, message: 'Not found' } } };
        }

        for (const uri of parsed.uris) {
          const known = this.state.searchResults.find((track) => track.uri === uri);
          playlist.tracks.push(known ?? { uri, name: 'Ajouté', artist: 'Artiste' });
        }

        playlist.snapshotId = `snapshot-${Date.now()}`;
        return { statusCode: 200, data: { snapshot_id: playlist.snapshotId } };
      })
      .persist();

    api
      .intercept({ path: /^\/v1\/playlists\/[^/]+\/items/, method: 'DELETE' })
      .reply(({ path, body }) => {
        const playlistId = this.extractPlaylistId(path);
        const parsed = JSON.parse(String(body)) as {
          tracks: Array<{ uri: string; positions: number[] }>;
          snapshot_id: string;
        };
        this.record('DELETE', `/playlists/${playlistId}/items`, parsed);

        const playlist = this.findPlaylist(playlistId);

        if (playlist === undefined) {
          return { statusCode: 404, data: { error: { status: 404, message: 'Not found' } } };
        }

        // Suppression par position, comme le fait réellement Spotify.
        const positionsToRemove = new Set(
          parsed.tracks.flatMap((track) => track.positions),
        );

        playlist.tracks = playlist.tracks.filter(
          (_track, index) => !positionsToRemove.has(index),
        );

        playlist.snapshotId = `snapshot-${Date.now()}`;
        return { statusCode: 200, data: { snapshot_id: playlist.snapshotId } };
      })
      .persist();
  }

  private extractPlaylistId(path: string): string {
    return /\/v1\/playlists\/([^/?]+)/.exec(path)?.[1] ?? '';
  }

  private findPlaylist(playlistId: string): MockPlaylist | undefined {
    return this.state.playlists.find((playlist) => playlist.id === playlistId);
  }
}

/** Construit un état de départ réaliste, avec des doublons à détecter. */
export function createDefaultState(): MockState {
  return {
    userId: 'moi',
    displayName: 'Moi',
    playlists: [
      {
        id: 'aaaaaaaaaaaaaaaaaaaaaa',
        name: 'Ma playlist',
        ownerId: 'moi',
        tracks: [
          { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', name: 'Creep', artist: 'Radiohead' },
          { uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', name: 'Karma Police', artist: 'Radiohead' },
          // Doublon strict de la position 0.
          { uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', name: 'Creep', artist: 'Radiohead' },
          // Doublon probable de la position 1 (remaster).
          {
            uri: 'spotify:track:cccccccccccccccccccccc',
            name: 'Karma Police - Remastered 2016',
            artist: 'Radiohead',
          },
        ],
      },
      {
        id: 'bbbbbbbbbbbbbbbbbbbbbb',
        name: "Playlist d'un autre",
        ownerId: 'quelquun-dautre',
        tracks: [{ uri: 'spotify:track:dddddddddddddddddddddd', name: 'Autre', artist: 'X' }],
      },
    ],
    searchResults: [
      { uri: 'spotify:track:eeeeeeeeeeeeeeeeeeeeee', name: 'No Surprises', artist: 'Radiohead' },
    ],
    // Un titre et sa réédition : doublon « probable », le seul cas possible
    // dans les likés puisqu'un même morceau ne peut y figurer qu'une fois.
    likedSongs: [
      { uri: 'spotify:track:ffffffffffffffffffffff', name: 'Idioteque', artist: 'Radiohead' },
      {
        uri: 'spotify:track:gggggggggggggggggggggg',
        name: 'Idioteque - Remastered 2021',
        artist: 'Radiohead',
      },
    ],
    requests: [],
  };
}
