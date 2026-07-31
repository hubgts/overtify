import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getLibraryIndex, syncTrackMembership } from '../services/libraryIndexService.js';
import { playlistIdSchema, trackUriSchema } from './schemas.js';
import type { LibraryIndexDto, MembershipSyncResultDto } from '../types/dto.js';

/**
 * Vue « où est ce morceau ? ».
 *
 * Spotify ne permet pas de savoir dans quelles playlists figure un titre.
 * Cette route expose l'index complet de la bibliothèque, servi depuis le cache
 * quand il est valide (cf. `libraryCache.ts`).
 */

const querySchema = z.object({
  /** Force la reconstruction, pour prendre en compte une modification externe. */
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const syncBodySchema = z.object({
  uri: trackUriSchema,
  /** État voulu : playlists devant contenir le morceau. */
  playlistIds: z.array(playlistIdSchema).max(50),
  /**
   * Playlists concernées par l'opération.
   *
   * Explicite et obligatoire : sans ce périmètre, une playlist absente de
   * `playlistIds` serait interprétée comme un retrait, y compris si le client
   * ne l'avait simplement pas chargée.
   */
  scopePlaylistIds: z
    .array(playlistIdSchema)
    .min(1, 'Le périmètre doit contenir au moins une playlist.')
    .max(200),
});

export async function libraryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/api/library', async (request): Promise<LibraryIndexDto> => {
    const { refresh } = querySchema.parse(request.query);

    return getLibraryIndex(request.spotify, request.session.userId, refresh);
  });

  /**
   * Synchronise l'appartenance d'un morceau : ajoute et retire en une fois.
   *
   * Le client envoie l'état voulu ; le serveur calcule les écarts à partir du
   * contenu réel des playlists, jamais du cache — dont les positions
   * pourraient être périmées.
   */
  fastify.post('/api/library/sync', async (request): Promise<MembershipSyncResultDto> => {
    const { uri, playlistIds, scopePlaylistIds } = syncBodySchema.parse(request.body);

    const result = await syncTrackMembership(
      request.spotify,
      request.session.userId,
      uri,
      playlistIds,
      scopePlaylistIds,
    );

    return { uri, ...result };
  });
}
