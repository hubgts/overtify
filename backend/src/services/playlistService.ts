import {
  SPOTIFY_MAX_PAGE_LIMIT,
  SPOTIFY_MAX_TRACKS_PER_REQUEST,
  playlistItemsPath,
} from '../config/spotify.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { chunk } from '../utils/chunk.js';
import { libraryCache } from './libraryCache.js';
import {
  pickCoverImageUrl,
  toPlaylistSummaryDto,
  toPlaylistTrackDtos,
  toTrackDto,
} from './mappers.js';
import type { SpotifyClient } from './spotifyClient.js';
import type {
  SpotifyPlaylist,
  SpotifyPlaylistTrackItem,
  SpotifySearchResponse,
  SpotifySnapshotResponse,
} from '../types/spotify.js';
import type {
  PlaylistDetailDto,
  PlaylistSummaryDto,
  SearchResultDto,
  SnapshotDto,
  TrackRemovalDto,
} from '../types/dto.js';

/**
 * Logique métier des playlists.
 *
 * Règle structurante d'Overtify : l'application ne gère que les playlists dont
 * l'utilisateur connecté est propriétaire. Les playlists simplement suivies
 * sont filtrées à la lecture et rejetées à l'écriture — l'API Spotify les
 * refuserait de toute façon, autant échouer tôt avec un message clair.
 */

function assertOwnership(playlist: SpotifyPlaylist, userId: string): void {
  const ownerId = playlist.owner?.id;

  // Sans propriétaire identifiable, on refuse par défaut plutôt que d'autoriser
  // une modification sur une playlist dont l'appartenance est incertaine.
  if (ownerId === undefined) {
    throw new ForbiddenError(
      `Impossible de vérifier le propriétaire de « ${playlist.name} ». Modification refusée.`,
    );
  }

  if (ownerId !== userId) {
    throw new ForbiddenError(
      `Overtify ne gère que vos propres playlists. « ${playlist.name} » appartient à ${
        playlist.owner?.display_name ?? ownerId
      }.`,
    );
  }
}

/**
 * Vrai si l'entrée renvoyée par Spotify est exploitable.
 *
 * `/me/playlists` peut contenir des `null` et des objets sans propriétaire
 * (playlists en cours de suppression, contenus indisponibles). Les écarter ici
 * évite de faire échouer toute la requête à cause d'une seule entrée abîmée.
 */
function isUsablePlaylist(
  playlist: SpotifyPlaylist | null | undefined,
): playlist is SpotifyPlaylist {
  return (
    playlist !== null &&
    playlist !== undefined &&
    typeof playlist.id === 'string' &&
    playlist.owner?.id !== undefined
  );
}

/** Liste les playlists possédées par l'utilisateur, celles suivies exclues. */
export async function listOwnedPlaylists(
  client: SpotifyClient,
  userId: string,
): Promise<PlaylistSummaryDto[]> {
  const playlists = await client.fetchAllPages<SpotifyPlaylist | null>(
    '/me/playlists',
    {},
    SPOTIFY_MAX_PAGE_LIMIT,
  );

  return playlists
    .filter(isUsablePlaylist)
    .filter((playlist) => playlist.owner?.id === userId)
    .map(toPlaylistSummaryDto);
}

/** Charge une playlist et l'intégralité de ses morceaux. */
export async function getOwnedPlaylistDetail(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
): Promise<PlaylistDetailDto> {
  const playlist = await client.request<SpotifyPlaylist>({ path: `/playlists/${playlistId}` });

  assertOwnership(playlist, userId);

  const items = await client.fetchAllPages<SpotifyPlaylistTrackItem>(
    playlistItemsPath(playlistId),
    {},
    SPOTIFY_MAX_PAGE_LIMIT,
  );

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? null,
    imageUrl: pickCoverImageUrl(playlist.images),
    ownerName: playlist.owner?.display_name ?? playlist.owner?.id ?? 'Inconnu',
    snapshotId: playlist.snapshot_id,
    tracks: toPlaylistTrackDtos(items),
  };
}

/** Vérifie la propriété avant toute mutation. */
async function assertOwnedPlaylist(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
): Promise<SpotifyPlaylist> {
  const playlist = await client.request<SpotifyPlaylist>({ path: `/playlists/${playlistId}` });
  assertOwnership(playlist, userId);
  return playlist;
}

export async function addTracksToPlaylist(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
  uris: string[],
): Promise<SnapshotDto> {
  await assertOwnedPlaylist(client, playlistId, userId);

  let snapshotId = '';

  // Lots séquentiels : l'ordre d'ajout est préservé et le rate limit évité.
  for (const batch of chunk(uris, SPOTIFY_MAX_TRACKS_PER_REQUEST)) {
    const result = await client.request<SpotifySnapshotResponse>({
      method: 'POST',
      path: playlistItemsPath(playlistId),
      body: { uris: batch },
    });

    snapshotId = result.snapshot_id;
  }

  // L'invalidation appartient à la mutation, pas à ses appelants : une route
  // qui l'oublierait servirait un index périmé, et la garde anti-doublon
  // s'appuierait sur des données fausses.
  libraryCache.invalidate(userId);

  return { snapshotId };
}

/**
 * Supprime des occurrences précises d'une playlist.
 *
 * Spotify supprime par (uri, positions) : c'est ce qui permet de retirer la
 * 2ᵉ et la 5ᵉ occurrence d'un titre en gardant la 1ʳᵉ. Sans `positions`,
 * l'API retirerait *toutes* les occurrences de l'URI, ce qui casserait le
 * dédoublonnage.
 *
 * `snapshotId` protège des modifications concurrentes : si la playlist a bougé
 * depuis sa lecture, Spotify rejette l'opération plutôt que d'effacer le
 * mauvais morceau.
 */
export async function removeTracksFromPlaylist(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
  removals: TrackRemovalDto[],
  snapshotId: string,
): Promise<SnapshotDto> {
  await assertOwnedPlaylist(client, playlistId, userId);

  const positions = removals.map((removal) => removal.position);

  if (new Set(positions).size !== positions.length) {
    throw new ValidationError('La liste des positions à supprimer contient des doublons.');
  }

  // Suppression par positions décroissantes : les lots suivants ne sont pas
  // décalés par les suppressions déjà appliquées.
  const sortedRemovals = [...removals].sort((a, b) => b.position - a.position);

  let currentSnapshotId = snapshotId;

  for (const batch of chunk(sortedRemovals, SPOTIFY_MAX_TRACKS_PER_REQUEST)) {
    const result = await client.request<SpotifySnapshotResponse>({
      method: 'DELETE',
      path: playlistItemsPath(playlistId),
      body: {
        tracks: batch.map((removal) => ({
          uri: removal.uri,
          positions: [removal.position],
        })),
        snapshot_id: currentSnapshotId,
      },
    });

    currentSnapshotId = result.snapshot_id;
  }

  libraryCache.invalidate(userId);

  return { snapshotId: currentSnapshotId };
}

export async function searchTracks(
  client: SpotifyClient,
  query: string,
  limit: number,
): Promise<SearchResultDto> {
  const response = await client.request<SpotifySearchResponse>({
    path: '/search',
    query: { q: query, type: 'track', limit },
  });

  return { tracks: response.tracks.items.map(toTrackDto) };
}

/**
 * Crée une playlist vide.
 *
 * Spotify a remplacé `POST /users/{id}/playlists` (désormais 403) par
 * `POST /me/playlists` — même famille de migration que `/tracks` → `/items`.
 */
export async function createPlaylist(
  client: SpotifyClient,
  userId: string,
  input: { name: string; description?: string | undefined; isPublic?: boolean | undefined },
): Promise<PlaylistSummaryDto> {
  const created = await client.request<SpotifyPlaylist>({
    method: 'POST',
    path: '/me/playlists',
    body: {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      // Spotify crée en public par défaut ; Overtify préfère l'inverse, une
      // playlist de tri n'ayant pas vocation à être exposée sans le vouloir.
      public: input.isPublic ?? false,
    },
  });

  libraryCache.invalidate(userId);

  return toPlaylistSummaryDto(created);
}

/** Renomme une playlist ou modifie sa description et sa visibilité. */
export async function updatePlaylist(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
  changes: {
    name?: string | undefined;
    description?: string | undefined;
    isPublic?: boolean | undefined;
  },
): Promise<void> {
  await assertOwnedPlaylist(client, playlistId, userId);

  await client.request<void>({
    method: 'PUT',
    path: `/playlists/${playlistId}`,
    body: {
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.description === undefined ? {} : { description: changes.description }),
      ...(changes.isPublic === undefined ? {} : { public: changes.isPublic }),
    },
  });

  libraryCache.invalidate(userId);
}

/**
 * Retire une playlist de la bibliothèque.
 *
 * Spotify n'offre aucune suppression réelle : on se désabonne de sa propre
 * playlist, qui disparaît alors de `/me/playlists` tout en restant restaurable.
 * C'est pourquoi l'interface parle de « retrait » et non de « suppression ».
 */
export async function removePlaylistFromLibrary(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
): Promise<PlaylistSummaryDto> {
  const playlist = await assertOwnedPlaylist(client, playlistId, userId);

  await client.request<void>({
    method: 'DELETE',
    path: `/playlists/${playlistId}/followers`,
  });

  libraryCache.invalidate(userId);

  return toPlaylistSummaryDto(playlist);
}

/** Réaffiche une playlist retirée en s'y réabonnant. */
export async function restorePlaylistToLibrary(
  client: SpotifyClient,
  playlistId: string,
  userId: string,
): Promise<void> {
  await client.request<void>({
    method: 'PUT',
    path: `/playlists/${playlistId}/followers`,
    body: { public: false },
  });

  libraryCache.invalidate(userId);
}
