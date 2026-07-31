import {
  LIKED_SONGS_ID,
  SPOTIFY_MAX_LIKED_TRACKS_PER_REQUEST,
  SPOTIFY_MAX_PAGE_LIMIT,
} from '../config/spotify.js';
import { ValidationError } from '../utils/errors.js';
import { chunk } from '../utils/chunk.js';
import { libraryCache } from './libraryCache.js';
import { toPlaylistTrackDtos } from './mappers.js';
import type { SpotifyClient } from './spotifyClient.js';
import type { SpotifyPlaylistTrackItem } from '../types/spotify.js';
import type {
  PlaylistDetailDto,
  PlaylistSummaryDto,
  SnapshotDto,
  TrackRemovalDto,
} from '../types/dto.js';

/**
 * Gestion des « Titres likés ».
 *
 * Cette collection ressemble à une playlist dans l'interface, mais s'en
 * distingue nettement côté API :
 *
 *  - endpoints propres : `/me/tracks` au lieu de `/playlists/{id}/items` ;
 *  - scopes propres : `user-library-read` / `user-library-modify` ;
 *  - **aucune notion de position** : Spotify supprime par identifiant de
 *    morceau, et un même titre ne peut y figurer qu'une seule fois ;
 *  - aucun `snapshot_id` : pas de protection contre les modifications
 *    concurrentes.
 *
 * L'unicité a une conséquence directe sur le dédoublonnage : les doublons
 * stricts y sont impossibles par construction, seuls les doublons « probables »
 * (remaster, réédition) peuvent exister.
 */

/** Titre de la collection, tel qu'affiché dans l'interface. */
const LIKED_SONGS_NAME = 'Titres likés';

/** Résumé présenté dans la sidebar, aux côtés des playlists. */
export async function getLikedSongsSummary(
  client: SpotifyClient,
): Promise<PlaylistSummaryDto> {
  // `limit=1` suffit : seul le total nous intéresse ici.
  const page = await client.request<{ total?: number }>({
    path: '/me/tracks',
    query: { limit: 1 },
  });

  return {
    id: LIKED_SONGS_ID,
    name: LIKED_SONGS_NAME,
    description: 'Les morceaux que vous avez likés',
    imageUrl: null,
    trackCount: page.total ?? 0,
    isPublic: false,
    collaborative: false,
    ownerName: 'Vous',
  };
}

/** Charge l'intégralité des titres likés. */
export async function getLikedSongsDetail(
  client: SpotifyClient,
): Promise<PlaylistDetailDto> {
  const items = await client.fetchAllPages<SpotifyPlaylistTrackItem>(
    '/me/tracks',
    {},
    SPOTIFY_MAX_PAGE_LIMIT,
  );

  return {
    id: LIKED_SONGS_ID,
    name: LIKED_SONGS_NAME,
    description: 'Les morceaux que vous avez likés',
    imageUrl: null,
    ownerName: 'Vous',
    // Pas de snapshot côté Spotify ; le champ reste dans le contrat d'API.
    snapshotId: '',
    tracks: toPlaylistTrackDtos(items),
  };
}

/**
 * Extrait l'identifiant Spotify d'un URI de morceau.
 *
 * `/me/tracks` travaille avec des identifiants nus, là où les playlists
 * utilisent des URI complets.
 */
function toTrackId(uri: string): string {
  const id = uri.split(':').pop();

  if (id === undefined || id === '') {
    throw new ValidationError(`URI de morceau invalide : ${uri}`);
  }

  return id;
}

export async function addLikedSongs(
  client: SpotifyClient,
  userId: string,
  uris: string[],
): Promise<SnapshotDto> {
  const ids = uris.map(toTrackId);

  for (const batch of chunk(ids, SPOTIFY_MAX_LIKED_TRACKS_PER_REQUEST)) {
    await client.request<void>({
      method: 'PUT',
      path: '/me/tracks',
      body: { ids: batch },
    });
  }

  // Invalidation portée par la mutation elle-même (cf. addTracksToPlaylist).
  libraryCache.invalidate(userId);

  // Pas de snapshot pour cette collection : on retourne une valeur vide pour
  // rester conforme au contrat partagé avec les playlists.
  return { snapshotId: '' };
}

/**
 * Retire des titres des likés.
 *
 * Les positions transmises sont ignorées : Spotify supprime par identifiant,
 * et un morceau n'apparaît qu'une fois dans cette collection. On déduplique
 * donc les identifiants pour éviter d'envoyer deux fois le même.
 */
export async function removeLikedSongs(
  client: SpotifyClient,
  userId: string,
  removals: TrackRemovalDto[],
): Promise<SnapshotDto> {
  const ids = [...new Set(removals.map((removal) => toTrackId(removal.uri)))];

  for (const batch of chunk(ids, SPOTIFY_MAX_LIKED_TRACKS_PER_REQUEST)) {
    await client.request<void>({
      method: 'DELETE',
      path: '/me/tracks',
      body: { ids: batch },
    });
  }

  libraryCache.invalidate(userId);

  return { snapshotId: '' };
}

/** Vrai si l'identifiant désigne les Titres likés plutôt qu'une playlist. */
export function isLikedSongsId(playlistId: string): boolean {
  return playlistId === LIKED_SONGS_ID;
}
