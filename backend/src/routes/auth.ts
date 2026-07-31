import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../config/env.js';
import { buildAuthorizationUrl, exchangeCodeForTokens } from '../services/spotifyAuth.js';
import { sessionStore } from '../services/sessionStore.js';
import { SpotifyClient } from '../services/spotifyClient.js';
import { toUserDto } from '../services/mappers.js';
import {
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  oauthStateCookieOptions,
  readOAuthStateCookie,
  sessionCookieOptions,
} from '../utils/cookies.js';
import type { SpotifyUser } from '../types/spotify.js';
import type { UserDto } from '../types/dto.js';

/**
 * Le callback peut être appelé avec `code` (succès) ou `error` (refus du
 * consentement). `state` est toujours présent et doit correspondre au cookie.
 */
const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

/** Redirige vers le front avec un code d'erreur lisible dans l'URL. */
function buildFrontendRedirect(status: 'success' | 'error', reason?: string): string {
  const url = new URL(env.FRONTEND_URL);
  url.searchParams.set('auth', status);

  if (reason !== undefined) {
    url.searchParams.set('reason', reason);
  }

  return url.toString();
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Démarre le flow OAuth.
   *
   * Le `state` aléatoire est déposé dans un cookie signé puis comparé au
   * retour : c'est la protection CSRF du flow d'autorisation.
   */
  fastify.get('/api/auth/login', async (_request, reply) => {
    const state = randomBytes(16).toString('hex');

    return reply
      .setCookie(OAUTH_STATE_COOKIE_NAME, state, oauthStateCookieOptions)
      .redirect(buildAuthorizationUrl(state), 302);
  });

  /**
   * Callback Spotify : échange le code contre des tokens, crée la session,
   * puis renvoie l'utilisateur vers le frontend.
   */
  fastify.get('/api/auth/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const expectedState = readOAuthStateCookie(request);

    void reply.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: '/' });

    if (query.error !== undefined) {
      request.log.info({ reason: query.error }, 'Consentement Spotify refusé');
      return reply.redirect(buildFrontendRedirect('error', 'access_denied'), 302);
    }

    const isStateValid =
      expectedState !== null && query.state !== undefined && query.state === expectedState;

    if (!isStateValid) {
      request.log.warn('State OAuth invalide ou manquant');
      return reply.redirect(buildFrontendRedirect('error', 'invalid_state'), 302);
    }

    if (query.code === undefined) {
      return reply.redirect(buildFrontendRedirect('error', 'missing_code'), 302);
    }

    try {
      const tokens = await exchangeCodeForTokens(query.code);
      const profile = await new SpotifyClient(tokens.accessToken).request<SpotifyUser>({
        path: '/me',
      });

      const session = sessionStore.create({ ...tokens, userId: profile.id });

      return reply
        .setCookie(SESSION_COOKIE_NAME, session.id, sessionCookieOptions)
        .redirect(buildFrontendRedirect('success'), 302);
    } catch (error) {
      request.log.error({ err: error }, "Échec de l'authentification Spotify");
      return reply.redirect(buildFrontendRedirect('error', 'token_exchange_failed'), 302);
    }
  });

  /** Profil de l'utilisateur connecté. Sert aussi de test de session au boot du front. */
  fastify.get(
    '/api/auth/me',
    { preHandler: fastify.authenticate },
    async (request): Promise<UserDto> => {
      const profile = await request.spotify.request<SpotifyUser>({ path: '/me' });
      return toUserDto(profile);
    },
  );

  /** Détruit la session côté serveur et efface le cookie. */
  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];

    if (sessionId !== undefined) {
      const unsigned = request.unsignCookie(sessionId);

      if (unsigned.valid && unsigned.value !== null) {
        sessionStore.destroy(unsigned.value);
      }
    }

    return reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' }).status(204).send();
  });
}
