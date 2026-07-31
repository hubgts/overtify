import { LIKED_SONGS_ID } from '../config/spotify.js';
import { libraryCache } from './libraryCache.js';
import { getLikedSongsDetail } from './likedSongsService.js';
import {
  addTracksToPlaylist,
  getOwnedPlaylistDetail,
  listOwnedPlaylists,
  removeTracksFromPlaylist,
} from './playlistService.js';
import type { SpotifyClient } from './spotifyClient.js';
import type {
  LibraryEntryDto,
  LibraryIndexDto,
  PlaylistSummaryDto,
  TrackLocationDto,
} from '../types/dto.js';

/**
 * Index de la bibliothèque : quel morceau se trouve où.
 *
 * Spotify cloisonne playlists et titres likés, sans jamais permettre de
 * demander « où est ce morceau chez moi ? ». Cet index répond à cette
 * question, et sert de socle à plusieurs fonctionnalités (vue bibliothèque,
 * pré-cochage lors de la qualification).
 *
 * **Un enregistrement = une entrée.** Deux éditions d'un même titre (original
 * et remaster) restent distinctes : cette vue est factuelle, le rapprochement
 * des éditions relève du dédoublonnage, qui repose sur une heuristique.
 */

/**
 * Construit l'index complet.
 *
 * Coût : une requête par playlist, plus la pagination — environ 25 appels pour
 * une bibliothèque de 11 playlists. C'est la raison d'être du cache
 * (cf. `libraryCache.ts`) : sans lui, chaque navigation le paierait.
 *
 * Une playlist devenue illisible est ignorée plutôt que de faire échouer
 * l'indexation entière.
 */
export async function buildLibraryIndex(
  client: SpotifyClient,
  userId: string,
): Promise<LibraryIndexDto> {
  const playlists = await listOwnedPlaylists(client, userId);

  /** URI → entrée en cours de construction. */
  const entries = new Map<string, LibraryEntryDto>();

  const addLocation = (
    track: { uri: string; name: string; artists: string[]; albumName: string; albumImageUrl: string | null; durationMs: number },
    location: TrackLocationDto,
  ): void => {
    const existing = entries.get(track.uri);

    if (existing === undefined) {
      entries.set(track.uri, {
        uri: track.uri,
        name: track.name,
        artists: track.artists,
        albumName: track.albumName,
        albumImageUrl: track.albumImageUrl,
        durationMs: track.durationMs,
        locations: [location],
      });

      return;
    }

    existing.locations.push(location);
  };

  // Titres likés d'abord : ils constituent la collection de référence.
  const likedSongs = await getLikedSongsDetail(client);

  for (const track of likedSongs.tracks) {
    addLocation(track, { playlistId: LIKED_SONGS_ID, position: track.position });
  }

  const indexedPlaylists: PlaylistSummaryDto[] = [];

  for (const playlist of playlists) {
    try {
      const detail = await getOwnedPlaylistDetail(client, playlist.id, userId);
      indexedPlaylists.push(playlist);

      for (const track of detail.tracks) {
        addLocation(track, { playlistId: playlist.id, position: track.position });
      }
    } catch {
      continue;
    }
  }

  return {
    entries: [...entries.values()],
    playlists: indexedPlaylists,
    likedCount: likedSongs.tracks.length,
    builtAt: new Date().toISOString(),
  };
}

/**
 * Index de la bibliothèque, servi depuis le cache quand il est valide.
 *
 * Point d'entrée unique : la vue bibliothèque et la qualification l'utilisent
 * toutes deux, ce qui évite de reconstruire deux index concurrents.
 */
export async function getLibraryIndex(
  client: SpotifyClient,
  userId: string,
  forceRefresh = false,
): Promise<LibraryIndexDto> {
  if (!forceRefresh) {
    const cached = libraryCache.get(userId);

    if (cached !== null) {
      return cached;
    }
  }

  const index = await buildLibraryIndex(client, userId);
  libraryCache.set(userId, index);

  return index;
}

/**
 * Playlists contenant un morceau donné, hors titres likés.
 *
 * Utilisé par la qualification pour pré-cocher les destinations où le titre
 * figure déjà.
 */
export function findPlaylistsContaining(index: LibraryIndexDto, uri: string): string[] {
  const entry = index.entries.find((candidate) => candidate.uri === uri);

  if (entry === undefined) {
    return [];
  }

  return entry.locations
    .filter((location) => location.playlistId !== LIKED_SONGS_ID)
    .map((location) => location.playlistId);
}

/**
 * Synchronise l'appartenance d'un morceau à un ensemble de playlists.
 *
 * `targetPlaylistIds` décrit l'état **voulu** : le morceau est ajouté là où il
 * manque, et retiré là où il ne devrait plus être. Les playlists absentes de
 * `scopePlaylistIds` ne sont pas touchées.
 *
 * Le périmètre est explicite plutôt que déduit de l'index : sans lui, une
 * playlist simplement absente de la liste envoyée par le client provoquerait un
 * retrait non voulu — un bug silencieux et destructeur.
 */
export async function syncTrackMembership(
  client: SpotifyClient,
  userId: string,
  uri: string,
  targetPlaylistIds: string[],
  scopePlaylistIds: string[],
): Promise<{ addedTo: string[]; removedFrom: string[]; skipped: string[] }> {
  const target = new Set(targetPlaylistIds);
  const addedTo: string[] = [];
  const removedFrom: string[] = [];
  const skipped: string[] = [];

  // L'index en cache dit où le morceau se trouve déjà. Il sert à écarter les
  // playlists sans changement : sans ce filtrage, on rechargeait le contenu
  // complet de chaque playlist du périmètre — des dizaines de requêtes pour
  // une opération qui n'en touche généralement qu'une ou deux.
  const index = await getLibraryIndex(client, userId);
  const currentlyIn = new Set(findPlaylistsContaining(index, uri));

  for (const playlistId of scopePlaylistIds) {
    const shouldBePresent = target.has(playlistId);

    if (shouldBePresent === currentlyIn.has(playlistId)) {
      skipped.push(playlistId);
      continue;
    }

    // Le détail n'est relu que pour les playlists réellement modifiées : les
    // positions doivent être fraîches, celles du cache pourraient être
    // périmées et un retrait sur position obsolète viserait le mauvais titre.
    const detail = await getOwnedPlaylistDetail(client, playlistId, userId);
    const occurrences = detail.tracks.filter((track) => track.uri === uri);

    if (shouldBePresent && occurrences.length === 0) {
      await addTracksToPlaylist(client, playlistId, userId, [uri]);
      addedTo.push(playlistId);
      continue;
    }

    if (!shouldBePresent && occurrences.length > 0) {
      await removeTracksFromPlaylist(
        client,
        playlistId,
        userId,
        // Toutes les occurrences : laisser un doublon derrière soi serait
        // incohérent avec la vocation de l'application.
        occurrences.map((track) => ({ uri: track.uri, position: track.position })),
        detail.snapshotId,
      );
      removedFrom.push(playlistId);
      continue;
    }

    // L'index et la réalité divergeaient : rien à faire ici.
    skipped.push(playlistId);
  }

  // La mutation qui vit dans le module propriétaire du cache doit a fortiori
  // l'invalider elle-même.
  libraryCache.invalidate(userId);

  return { addedTo, removedFrom, skipped };
}
