/**
 * Hiérarchie d'erreurs applicatives.
 *
 * Toute erreur levée volontairement par le code métier hérite de AppError.
 * Le gestionnaire d'erreurs Fastify sait alors produire une réponse HTTP
 * cohérente ; tout le reste est traité comme une 500 anonyme, afin de ne
 * jamais fuiter de détail d'implémentation au client.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SPOTIFY_RATE_LIMITED'
  | 'SPOTIFY_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  /** Secondes à attendre avant de réessayer (rate limit uniquement). */
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    options: { retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Vous n'êtes pas connecté à Spotify.") {
    super('UNAUTHENTICATED', 401, message);
  }
}

export class SessionExpiredError extends AppError {
  constructor(message = 'Votre session Spotify a expiré, veuillez vous reconnecter.') {
    super('SESSION_EXPIRED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas les droits sur cette ressource.") {
    super('FORBIDDEN', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super('NOT_FOUND', 404, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', 400, message);
  }
}

export class SpotifyRateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(
      'SPOTIFY_RATE_LIMITED',
      429,
      `Trop de requêtes envoyées à Spotify. Réessayez dans ${retryAfterSeconds} seconde(s).`,
      { retryAfterSeconds },
    );
  }
}

export class SpotifyUnavailableError extends AppError {
  constructor(message = "L'API Spotify est momentanément indisponible.", cause?: unknown) {
    super('SPOTIFY_UNAVAILABLE', 502, message, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
