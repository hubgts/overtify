import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

import { isAppError } from '../utils/errors.js';
import type { ApiErrorBody } from '../types/dto.js';

/**
 * Point de sortie unique pour toutes les erreurs de l'API.
 *
 * Deux garanties :
 *  1. le front reçoit toujours la même forme { error: { code, message } } ;
 *  2. une erreur inattendue est journalisée en détail côté serveur mais
 *     renvoyée de façon anonyme, sans fuite de stack trace ni de secret.
 */
async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      request.log.info(
        { code: error.code, statusCode: error.statusCode, path: request.url },
        error.message,
      );

      if (error.retryAfterSeconds !== undefined) {
        void reply.header('Retry-After', String(error.retryAfterSeconds));
      }

      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: error.retryAfterSeconds }),
        },
      };

      return reply.status(error.statusCode).send(body);
    }

    if (error instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((issue) => issue.message).join(', '),
        },
      };

      return reply.status(400).send(body);
    }

    // Erreur de validation de schéma Fastify.
    const fastifyError = error as FastifyError;

    if (fastifyError.validation !== undefined) {
      const body: ApiErrorBody = {
        error: { code: 'VALIDATION_ERROR', message: fastifyError.message },
      };

      return reply.status(400).send(body);
    }

    request.log.error({ err: error, path: request.url }, 'Erreur non gérée');

    const body: ApiErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue.',
      },
    };

    return reply.status(500).send(body);
  });

  fastify.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: `Route introuvable : ${request.method} ${request.url}` },
    };

    return reply.status(404).send(body);
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
