import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  addTracksToPlaylist,
  createPlaylist,
  getOwnedPlaylistDetail,
  listOwnedPlaylists,
  removePlaylistFromLibrary,
  removeTracksFromPlaylist,
  restorePlaylistToLibrary,
  searchTracks,
  updatePlaylist,
} from '../services/playlistService.js';
import {
  forgetRemoved,
  listRemoved,
  rememberRemoved,
} from '../services/removedPlaylistStore.js';
import { SPOTIFY_MAX_TRACKS_PER_REQUEST } from '../config/spotify.js';
import { ValidationError } from '../utils/errors.js';
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
  RemovedPlaylistDto,
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

/**
 * Champs d'une playlist.
 *
 * `name` non vide : Spotify accepte une chaîne vide mais affiche alors une
 * playlist sans titre, impossible à distinguer des autres.
 */
const playlistBodySchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis.').max(100, 'Nom trop long (100 max).'),
  description: z.string().trim().max(300, 'Description trop longue (300 max).').optional(),
  isPublic: z.boolean().optional(),
});

/** Modification : tous les champs sont optionnels, mais au moins un requis. */
const playlistEditSchema = playlistBodySchema
  .partial()
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    'Aucune modification fournie.',
  );

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

  /** Crée une playlist vide, dont l'utilisateur devient propriétaire. */
  fastify.post('/api/playlists', async (request, reply): Promise<PlaylistSummaryDto> => {
    const input = playlistBodySchema.parse(request.body);

    const created = await createPlaylist(request.spotify, request.session.userId, input);

    void reply.status(201);
    return created;
  });

  /** Renomme une playlist, ou modifie sa description et sa visibilité. */
  fastify.put('/api/playlists/:playlistId', async (request, reply) => {
    const { playlistId } = playlistParamsSchema.parse(request.params);
    const changes = playlistEditSchema.parse(request.body);

    if (isLikedSongsId(playlistId)) {
      throw new ValidationError('Les Titres likés ne peuvent pas être modifiés.');
    }

    await updatePlaylist(request.spotify, playlistId, request.session.userId, changes);

    return reply.status(204).send();
  });

  /**
   * Retire une playlist de la bibliothèque.
   *
   * Spotify n'offre pas de suppression réelle : on se désabonne, et la
   * playlist reste restaurable. Overtify mémorise le retrait pour pouvoir
   * l'afficher grisée et proposer un réabonnement.
   */
  fastify.delete('/api/playlists/:playlistId', async (request, reply) => {
    const { playlistId } = playlistParamsSchema.parse(request.params);

    if (isLikedSongsId(playlistId)) {
      throw new ValidationError('Les Titres likés ne peuvent pas être retirés.');
    }

    const removed = await removePlaylistFromLibrary(
      request.spotify,
      playlistId,
      request.session.userId,
    );

    await rememberRemoved(request.session.userId, {
      id: removed.id,
      name: removed.name,
      imageUrl: removed.imageUrl,
      trackCount: removed.trackCount,
      removedAt: new Date().toISOString(),
    });

    return reply.status(204).send();
  });

  /** Playlists retirées, affichées grisées et restaurables. */
  fastify.get('/api/playlists/removed', async (request): Promise<RemovedPlaylistDto[]> => {
    return listRemoved(request.session.userId);
  });

  /** Réaffiche une playlist retirée en s'y réabonnant. */
  fastify.post('/api/playlists/:playlistId/restore', async (request, reply) => {
    const { playlistId } = playlistParamsSchema.parse(request.params);

    await restorePlaylistToLibrary(request.spotify, playlistId, request.session.userId);
    await forgetRemoved(request.session.userId, playlistId);

    return reply.status(204).send();
  });

  fastify.get('/api/search/tracks', async (request): Promise<SearchResultDto> => {
    const { q, limit } = searchQuerySchema.parse(request.query);
    return searchTracks(request.spotify, q, limit);
  });
}
