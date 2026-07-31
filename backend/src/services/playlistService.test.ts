import { describe, expect, it, vi } from 'vitest';

import { removeTracksFromPlaylist, listOwnedPlaylists } from './playlistService.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import type { SpotifyClient } from './spotifyClient.js';

/**
 * Tests des règles métier sensibles du service playlists :
 *  - la garde de propriété (Overtify ne gère que vos propres playlists) ;
 *  - l'ordre de suppression, dont dépend la justesse du dédoublonnage.
 *
 * Le client Spotify est simulé : ces tests portent sur notre logique, pas sur
 * l'API distante.
 */

const OWNER_ID = 'moi';

function makePlaylist(ownerId: string) {
  return {
    id: 'playlist123',
    name: 'Ma playlist',
    description: null,
    images: [],
    owner: { id: ownerId, display_name: ownerId },
    public: true,
    collaborative: false,
    snapshot_id: 'snapshot-1',
    tracks: { total: 0 },
  };
}

/** Client simulé : `request` renvoie la playlist, puis les réponses fournies. */
function makeClient(playlistOwnerId: string, snapshotResponses: string[] = []) {
  let snapshotIndex = 0;

  const request = vi.fn(async (options: { method?: string }) => {
    if (options.method === 'DELETE' || options.method === 'POST') {
      const snapshotId = snapshotResponses[snapshotIndex] ?? `snapshot-${snapshotIndex + 2}`;
      snapshotIndex += 1;
      return { snapshot_id: snapshotId };
    }

    return makePlaylist(playlistOwnerId);
  });

  const fetchAllPages = vi.fn(async () => []);

  return { request, fetchAllPages } as unknown as SpotifyClient & {
    request: ReturnType<typeof vi.fn>;
    fetchAllPages: ReturnType<typeof vi.fn>;
  };
}

describe('listOwnedPlaylists', () => {
  it('exclut les playlists dont l’utilisateur n’est pas propriétaire', async () => {
    const client = makeClient(OWNER_ID);
    client.fetchAllPages.mockResolvedValueOnce([
      makePlaylist(OWNER_ID),
      makePlaylist('quelqun-dautre'),
    ]);

    const playlists = await listOwnedPlaylists(client, OWNER_ID);

    expect(playlists).toHaveLength(1);
    expect(playlists[0]?.ownerName).toBe(OWNER_ID);
  });

  /**
   * Régression : `/me/playlists` renvoie en pratique des entrées incomplètes
   * (playlists en cours de suppression, contenus indisponibles). Une seule
   * entrée abîmée faisait échouer toute la requête en 500.
   */
  describe('robustesse aux entrées incomplètes', () => {
    it('ignore les entrées nulles', async () => {
      const client = makeClient(OWNER_ID);
      client.fetchAllPages.mockResolvedValueOnce([null, makePlaylist(OWNER_ID), undefined]);

      await expect(listOwnedPlaylists(client, OWNER_ID)).resolves.toHaveLength(1);
    });

    it('ignore une playlist sans propriétaire', async () => {
      const client = makeClient(OWNER_ID);
      const { owner: _owner, ...withoutOwner } = makePlaylist(OWNER_ID);
      client.fetchAllPages.mockResolvedValueOnce([withoutOwner, makePlaylist(OWNER_ID)]);

      await expect(listOwnedPlaylists(client, OWNER_ID)).resolves.toHaveLength(1);
    });

    it('accepte une playlist sans aucun compteur et affiche 0 morceau', async () => {
      const client = makeClient(OWNER_ID);
      const { tracks: _tracks, ...withoutTracks } = makePlaylist(OWNER_ID);
      client.fetchAllPages.mockResolvedValueOnce([withoutTracks]);

      const playlists = await listOwnedPlaylists(client, OWNER_ID);

      expect(playlists).toHaveLength(1);
      expect(playlists[0]?.trackCount).toBe(0);
    });

    /**
     * Régression : `/me/playlists` expose le compteur sous `items` et non
     * `tracks`. Ne lire que `tracks` affichait « 0 morceau » partout.
     */
    describe('compteur de morceaux selon la forme de la réponse', () => {
      it('lit `tracks.total` (documentation officielle)', async () => {
        const client = makeClient(OWNER_ID);
        client.fetchAllPages.mockResolvedValueOnce([
          { ...makePlaylist(OWNER_ID), tracks: { total: 42 } },
        ]);

        const playlists = await listOwnedPlaylists(client, OWNER_ID);

        expect(playlists[0]?.trackCount).toBe(42);
      });

      it('lit `items.total` quand `tracks` est absent', async () => {
        const client = makeClient(OWNER_ID);
        const { tracks: _tracks, ...base } = makePlaylist(OWNER_ID);
        client.fetchAllPages.mockResolvedValueOnce([{ ...base, items: { total: 17 } }]);

        const playlists = await listOwnedPlaylists(client, OWNER_ID);

        expect(playlists[0]?.trackCount).toBe(17);
      });

      it('compte les éléments quand `items` est un tableau', async () => {
        const client = makeClient(OWNER_ID);
        const { tracks: _tracks, ...base } = makePlaylist(OWNER_ID);
        client.fetchAllPages.mockResolvedValueOnce([
          { ...base, items: [{}, {}, {}] },
        ]);

        const playlists = await listOwnedPlaylists(client, OWNER_ID);

        expect(playlists[0]?.trackCount).toBe(3);
      });
    });

    it('accepte une playlist sans images ni description', async () => {
      const client = makeClient(OWNER_ID);
      const { images: _images, description: _description, ...minimal } = makePlaylist(OWNER_ID);
      client.fetchAllPages.mockResolvedValueOnce([minimal]);

      const playlists = await listOwnedPlaylists(client, OWNER_ID);

      expect(playlists[0]).toMatchObject({ imageUrl: null, description: null });
    });
  });
});

describe('removeTracksFromPlaylist', () => {
  it('refuse de modifier la playlist d’un autre utilisateur', async () => {
    const client = makeClient('quelqun-dautre');

    await expect(
      removeTracksFromPlaylist(
        client,
        'playlist123',
        OWNER_ID,
        [{ uri: 'spotify:track:a', position: 0 }],
        'snapshot-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejette deux suppressions sur la même position', async () => {
    const client = makeClient(OWNER_ID);

    await expect(
      removeTracksFromPlaylist(
        client,
        'playlist123',
        OWNER_ID,
        [
          { uri: 'spotify:track:a', position: 2 },
          { uri: 'spotify:track:b', position: 2 },
        ],
        'snapshot-1',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('supprime par positions décroissantes', async () => {
    // Ordre décroissant : les suppressions déjà appliquées ne décalent pas
    // les positions restantes.
    const client = makeClient(OWNER_ID);

    await removeTracksFromPlaylist(
      client,
      'playlist123',
      OWNER_ID,
      [
        { uri: 'spotify:track:a', position: 1 },
        { uri: 'spotify:track:b', position: 8 },
        { uri: 'spotify:track:c', position: 4 },
      ],
      'snapshot-1',
    );

    const deleteCall = client.request.mock.calls.find(
      ([options]) => (options as { method?: string }).method === 'DELETE',
    );

    const body = (deleteCall?.[0] as { body: { tracks: { positions: number[] }[] } }).body;
    const positions = body.tracks.map((track) => track.positions[0]);

    expect(positions).toEqual([8, 4, 1]);
  });

  it('transmet le snapshot_id pour se prémunir des modifications concurrentes', async () => {
    const client = makeClient(OWNER_ID);

    await removeTracksFromPlaylist(
      client,
      'playlist123',
      OWNER_ID,
      [{ uri: 'spotify:track:a', position: 0 }],
      'snapshot-attendu',
    );

    const deleteCall = client.request.mock.calls.find(
      ([options]) => (options as { method?: string }).method === 'DELETE',
    );

    const body = (deleteCall?.[0] as { body: { snapshot_id: string } }).body;

    expect(body.snapshot_id).toBe('snapshot-attendu');
  });

  it('retourne le dernier snapshot renvoyé par Spotify', async () => {
    const client = makeClient(OWNER_ID, ['snapshot-final']);

    const result = await removeTracksFromPlaylist(
      client,
      'playlist123',
      OWNER_ID,
      [{ uri: 'spotify:track:a', position: 0 }],
      'snapshot-1',
    );

    expect(result.snapshotId).toBe('snapshot-final');
  });
});
