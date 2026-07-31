import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyRequest } from 'fastify';

import { isProduction } from '../config/env.js';
import { SESSION_TTL_MS } from '../services/sessionStore.js';

export const SESSION_COOKIE_NAME = 'overtify_session';
export const OAUTH_STATE_COOKIE_NAME = 'overtify_oauth_state';

/**
 * Options communes aux cookies applicatifs.
 *
 * - httpOnly : inaccessible au JS, donc immunisé au vol par XSS.
 * - sameSite lax : bloque les requêtes cross-site non idempotentes (CSRF),
 *   tout en autorisant le retour de redirection depuis accounts.spotify.com.
 * - secure : uniquement en production, sinon le cookie serait rejeté en
 *   développement sur http://localhost.
 * - signed : intégrité garantie par SESSION_SECRET.
 */
const baseCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  signed: true,
  path: '/',
};

export const sessionCookieOptions: CookieSerializeOptions = {
  ...baseCookieOptions,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};

/** Le cookie de state ne vit que le temps de l'aller-retour OAuth. */
export const oauthStateCookieOptions: CookieSerializeOptions = {
  ...baseCookieOptions,
  maxAge: 10 * 60,
};

/**
 * Lit et vérifie la signature d'un cookie.
 *
 * Retourne null si le cookie est absent ou si sa signature est invalide, ce qui
 * évite de faire confiance à une valeur forgée par le client.
 */
function readSignedCookie(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name];

  if (raw === undefined) {
    return null;
  }

  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value !== null ? unsigned.value : null;
}

export function readSessionCookie(request: FastifyRequest): string | null {
  return readSignedCookie(request, SESSION_COOKIE_NAME);
}

export function readOAuthStateCookie(request: FastifyRequest): string | null {
  return readSignedCookie(request, OAUTH_STATE_COOKIE_NAME);
}
