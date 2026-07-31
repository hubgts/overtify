import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

import { env, isProduction } from './config/env.js';
import authenticatePlugin from './plugins/authenticate.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { playlistRoutes } from './routes/playlists.js';
import { qualificationRoutes } from './routes/qualification.js';
import { libraryRoutes } from './routes/library.js';

/**
 * Construit l'instance Fastify.
 *
 * Extrait du point d'entrée pour rester testable : un test peut instancier
 * l'app et l'interroger via `inject()` sans ouvrir de port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: isProduction ? 'info' : 'debug',
      ...(isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }),
      // Empêche les tokens de se retrouver dans les logs.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: isProduction,
  });

  await fastify.register(errorHandlerPlugin);

  /**
   * CORS restreint à l'origine du frontend, avec credentials : indispensable
   * pour que le navigateur transmette le cookie de session en cross-origin
   * (front sur :5173, back sur :3001 en développement).
   */
  await fastify.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
  });

  await fastify.register(cookie, { secret: env.SESSION_SECRET });
  await fastify.register(authenticatePlugin);

  fastify.get('/api/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  await fastify.register(authRoutes);
  await fastify.register(playlistRoutes);
  await fastify.register(qualificationRoutes);
  await fastify.register(libraryRoutes);

  return fastify;
}
