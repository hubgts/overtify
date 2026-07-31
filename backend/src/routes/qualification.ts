import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  getQualificationHistory,
  getQualificationQueue,
  qualifyTrack,
  resetQualifications,
  unqualifyTrack,
} from '../services/qualificationService.js';
import { playlistIdSchema, trackUriSchema } from './schemas.js';
import type {
  QualificationQueueDto,
  QualificationRecordDto,
  QualifyResultDto,
} from '../types/dto.js';

/**
 * Routes de qualification des titres likés.
 *
 * Le tri s'étale sur plusieurs séances : la mémoire des titres déjà traités
 * est persistée côté serveur (cf. `qualificationStore.ts`).
 */

const qualifyBodySchema = z.object({
  uri: trackUriSchema,
  /**
   * Playlists de destination. Un tableau vide correspond au bouton
   * « Passer » : le titre est marqué traité sans modification côté Spotify.
   */
  playlistIds: z.array(playlistIdSchema).max(50, 'Trop de playlists de destination.'),
});

const unqualifyBodySchema = z.object({ uri: trackUriSchema });

export async function qualificationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  /** File d'attente : titres restant à traiter et destinations possibles. */
  fastify.get(
    '/api/qualification/queue',
    async (request): Promise<QualificationQueueDto> => {
      return getQualificationQueue(request.spotify, request.session.userId);
    },
  );

  /** Enregistre la décision prise sur un titre. */
  fastify.post('/api/qualification/qualify', async (request): Promise<QualifyResultDto> => {
    const { uri, playlistIds } = qualifyBodySchema.parse(request.body);

    const result = await qualifyTrack(
      request.spotify,
      request.session.userId,
      uri,
      playlistIds,
    );

    return result;
  });

  /** Annule une décision : le titre redevient à traiter. */
  fastify.post('/api/qualification/undo', async (request, reply) => {
    const { uri } = unqualifyBodySchema.parse(request.body);

    await unqualifyTrack(request.session.userId, uri);
    return reply.status(204).send();
  });

  /**
   * Efface tout l'historique.
   *
   * N'affecte aucune donnée Spotify : seule la mémoire d'Overtify est remise
   * à zéro, pour repasser sur l'ensemble des likés.
   */
  fastify.post('/api/qualification/reset', async (request, reply) => {
    await resetQualifications(request.session.userId);
    return reply.status(204).send();
  });

  /** Historique des décisions, du plus récent au plus ancien. */
  fastify.get(
    '/api/qualification/history',
    async (request): Promise<QualificationRecordDto[]> => {
      return getQualificationHistory(request.session.userId);
    },
  );
}
