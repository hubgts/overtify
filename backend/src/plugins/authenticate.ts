import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { sessionStore, type Session } from '../services/sessionStore.js';
import { refreshAccessToken, TOKEN_REFRESH_MARGIN_MS } from '../services/spotifyAuth.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { UnauthenticatedError } from '../utils/errors.js';
import { SESSION_COOKIE_NAME, readSessionCookie } from '../utils/cookies.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Session Spotify courante. Défini uniquement sur les routes authentifiées. */
    session: Session;
    /** Client Spotify porteur d'un access token valide. */
    spotify: SpotifyClient;
  }

  interface FastifyInstance {
    /** preHandler à poser sur toute route nécessitant une session. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Garantit un access token valide avant d'atteindre le handler.
 *
 * Le refresh est fait ici, en amont : les routes métier n'ont jamais à gérer
 * l'expiration, et le front ne reçoit pas de 401 intempestif.
 */
async function ensureFreshAccessToken(session: Session): Promise<Session> {
  const isStillValid = session.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now();

  if (isStillValid) {
    return session;
  }

  const tokens = await refreshAccessToken(session.refreshToken);
  sessionStore.updateTokens(session.id, tokens);

  return { ...session, ...tokens };
}

async function authenticatePlugin(fastify: FastifyInstance): Promise<void> {
  // Les décorateurs sont déclarés sans valeur : ils ne sont renseignés que par
  // le preHandler `authenticate`, donc uniquement sur les routes protégées.
  fastify.decorateRequest('session');
  fastify.decorateRequest('spotify');

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = readSessionCookie(request);

    if (sessionId === null) {
      throw new UnauthenticatedError();
    }

    const storedSession = sessionStore.get(sessionId);

    if (storedSession === null) {
      // Cookie orphelin (backend redémarré, session expirée) : on nettoie.
      void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      throw new UnauthenticatedError();
    }

    const session = await ensureFreshAccessToken(storedSession);

    request.session = session;
    request.spotify = new SpotifyClient(session.accessToken);
  });
}

export default fp(authenticatePlugin, { name: 'authenticate' });
