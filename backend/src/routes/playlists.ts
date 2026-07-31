import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  addTracksToPlaylist,
  getOwnedPlaylistDetail,
  listOwnedPlaylists,
  removeTracksFromPlaylist,
  searchTracks,
} from '../services/playlistService.js';
import { SPOTIFY_MAX_TRACKS_PER_REQUEST } from '../config/spotify.js';
import { playlistOrLikedIdSchema, trackUriSchema } from './schemas.js';
import {
  addLikedSongs,
  getLikedSongsDetail,
  getLikedSongsSummary,
  isLikedSongsId,
  removeLikedSongs,
} from '../services/likedSongsService.js';
import type {
  PlaylistDetailDto,
  PlaylistSummaryDto,
  SearchResultDto,
  SnapshotDto,
} from '../types/dto.js';

const playlistParamsSchema = z.object({ playlistId: playlistOrLikedIdSchema });

const addTracksBodySchema = z.object({
  uris: z
    .array(trackUriSchema)
    .min(1, 'Au moins un morceau doit être fourni.')
    .max(500, 'Trop de morceaux en une seule requête (500 maximum).'),
});

const removeTracksBodySchema = z.object({
  tracks: z
    .array(
      z.object({
        uri: trackUriSchema,
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'Au moins une occurrence doit être fournie.')
    .max(500, 'Trop de suppressions en une seule requête (500 maximum).'),
  // Chaîne vide acceptée : les Titres likés n'ont pas de snapshot Spotify.
  snapshotId: z.string(),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'La recherche ne peut pas être vide.').max(200),
  limit: z.coerce.number().int().min(1).max(SPOTIFY_MAX_TRACKS_PER_REQUEST).default(20),
});

export async function playlistRoutes(fastify: FastifyInstance): Promise<void> {
  // Toutes les routes de ce module exigent une session valide.
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/api/playlists', async (request): Promise<PlaylistSummaryDto[]> => {
    // Les deux appels sont indépendants : on les parallélise.
    const [likedSongs, playlists] = await Promise.all([
      getLikedSongsSummary(request.spotify),
      listOwnedPlaylists(request.spotify, request.session.userId),
    ]);

    // Les Titres likés en tête, comme dans l'application Spotify.
    return [likedSongs, ...playlists];
  });

  fastify.get('/api/playlists/:playlistId', async (request): Promise<PlaylistDetailDto> => {
    const { playlistId } = playlistParamsSchema.parse(request.params);

    if (isLikedSongsId(playlistId)) {
      return getLikedSongsDetail(request.spotify);
    }

    return getOwnedPlaylistDetail(request.spotify, playlistId, request.session.userId);
  });

  fastify.post('/api/playlists/:playlistId/tracks', async (request): Promise<SnapshotDto> => {
    const { playlistId } = playlistParamsSchema.parse(request.params);
    const { uris } = addTracksBodySchema.parse(request.body);

    const result = isLikedSongsId(playlistId)
      ? await addLikedSongs(request.spotify, request.session.userId, uris)
      : await addTracksToPlaylist(request.spotify, playlistId, request.session.userId, uris);

    return result;
  });

  /**
   * Suppression d'occurrences précises.
   *
   * DELETE avec corps de requête : imposé par l'API Spotify, qui a besoin des
   * positions et du snapshot_id. Fastify l'accepte nativement.
   */
  fastify.delete('/api/playlists/:playlistId/tracks', async (request): Promise<SnapshotDto> => {
    const { playlistId } = playlistParamsSchema.parse(request.params);
    const { tracks, snapshotId } = removeTracksBodySchema.parse(request.body);

    const result = isLikedSongsId(playlistId)
      ? await removeLikedSongs(request.spotify, request.session.userId, tracks)
      : await removeTracksFromPlaylist(
          request.spotify,
          playlistId,
          request.session.userId,
          tracks,
          snapshotId,
        );

    return result;
  });

  fastify.get('/api/search/tracks', async (request): Promise<SearchResultDto> => {
    const { q, limit } = searchQuerySchema.parse(request.query);
    return searchTracks(request.spotify, q, limit);
  });
}
