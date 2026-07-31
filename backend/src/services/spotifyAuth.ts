import { SPOTIFY_ACCOUNTS_URL, SPOTIFY_SCOPE_STRING } from '../config/spotify.js';
import { env } from '../config/env.js';
import { SessionExpiredError, SpotifyUnavailableError } from '../utils/errors.js';
import { httpFetch } from '../utils/httpClient.js';
import type { SpotifyTokenResponse } from '../types/spotify.js';

/**
 * Authorization Code Flow (sans PKCE).
 *
 * Le client_secret ne quitte jamais ce module : il n'est utilisé que dans
 * l'en-tête Basic des appels serveur-à-serveur vers accounts.spotify.com.
 * Le navigateur ne reçoit qu'un identifiant de session opaque.
 */

/** Marge avant expiration : on rafraîchit un peu en avance pour absorber la latence. */
export const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

function basicAuthHeader(): string {
  const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/** URL vers laquelle rediriger l'utilisateur pour qu'il autorise Overtify. */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPE_STRING,
    state,
    // Force l'écran de consentement : utile pour changer de compte facilement.
    show_dialog: 'true',
  });

  return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  let response: Response;

  try {
    response = await httpFetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (cause) {
    throw new SpotifyUnavailableError('Impossible de joindre le service de tokens Spotify.', cause);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    // 400 sur /api/token = code ou refresh token invalide : reconnexion requise.
    if (response.status === 400) {
      throw new SessionExpiredError(
        'Autorisation Spotify invalide ou expirée. Veuillez vous reconnecter.',
      );
    }

    throw new SpotifyUnavailableError(
      `Échec de l'échange de token (HTTP ${response.status}).`,
      detail.slice(0, 500),
    );
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Échange le code d'autorisation reçu sur le callback contre un jeu de tokens. */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
    }),
  );

  if (token.refresh_token === undefined) {
    throw new SpotifyUnavailableError("Spotify n'a pas fourni de refresh token.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

/**
 * Rafraîchit un access token expiré.
 *
 * Spotify ne renvoie pas systématiquement un nouveau refresh token ;
 * on conserve alors l'ancien, qui reste valide.
 */
export async function refreshAccessToken(currentRefreshToken: string): Promise<TokenSet> {
  const token = await requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    }),
  );

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? currentRefreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
