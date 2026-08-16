import type { ApiErrorBody } from '../types/api';

/**
 * Client HTTP de l'API Overtify.
 *
 * Toutes les requêtes partent avec `credentials: 'include'` : c'est le cookie
 * de session httpOnly qui authentifie l'utilisateur. Aucun token Spotify ne
 * transite ni n'est stocké côté navigateur.
 */

/** Erreur d'API portant le code métier renvoyé par le backend. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    status: number,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  /** Vrai si l'utilisateur doit se reconnecter. */
  get isAuthError(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.code === 'SESSION_EXPIRED';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }

  const { error } = value as { error: unknown };

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);

  if (isApiErrorBody(body)) {
    return new ApiError(
      body.error.code,
      response.status,
      body.error.message,
      body.error.retryAfterSeconds,
    );
  }

  return new ApiError(
    'INTERNAL_ERROR',
    response.status,
    `La requête a échoué (HTTP ${response.status}).`,
  );
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // Une requête annulée ne doit pas être présentée comme une panne réseau.
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }

    throw new ApiError(
      'NETWORK_ERROR',
      0,
      'Impossible de joindre le serveur Overtify. Vérifiez qu’il est démarré.',
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, signal === undefined ? {} : { signal }),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', ...(body === undefined ? {} : { body }) }),

  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', ...(body === undefined ? {} : { body }) }),

  delete: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body }) }),
};
