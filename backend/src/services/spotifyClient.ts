import { SPOTIFY_API_URL } from '../config/spotify.js';
import {
  SessionExpiredError,
  ForbiddenError,
  NotFoundError,
  SpotifyRateLimitError,
  SpotifyUnavailableError,
} from '../utils/errors.js';
import { logApiExchange } from '../utils/apiLogger.js';
import { httpFetch } from '../utils/httpClient.js';
import type { SpotifyPage } from '../types/spotify.js';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Chemin relatif à l'API, ex. '/me/playlists'. */
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/** Nombre de tentatives supplémentaires en cas de 429 ou d'erreur serveur. */
const MAX_RETRIES = 2;

/** Au-delà, on préfère rendre la main à l'utilisateur plutôt que bloquer la requête. */
const MAX_AUTO_RETRY_DELAY_SECONDS = 5;

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${SPOTIFY_API_URL}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function parseRetryAfter(response: Response): number {
  const header = response.headers.get('retry-after');
  const parsed = header === null ? Number.NaN : Number.parseInt(header, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function delay(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Traduit une réponse Spotify en erreur applicative.
 *
 * Le 401 est traduit en SessionExpiredError : le rafraîchissement proactif du
 * token devrait l'éviter, donc s'il survient c'est que le refresh token est
 * révoqué et qu'une reconnexion est nécessaire.
 */
async function toAppError(response: Response): Promise<never> {
  const detail = await response.text().catch(() => '');

  // Les réponses en erreur sont les plus instructives : on les journalise
  // intégralement, avec l'URL qui les a provoquées.
  void logApiExchange({
    method: 'ERROR',
    url: response.url,
    status: response.status,
    durationMs: 0,
    responseBody: detail,
  });

  switch (response.status) {
    case 401:
      throw new SessionExpiredError();
    case 403:
      throw new ForbiddenError(
        "Spotify a refusé l'opération. Vérifiez que vous êtes bien propriétaire de cette playlist.",
      );
    case 404:
      throw new NotFoundError('Ressource Spotify introuvable.');
    case 429:
      throw new SpotifyRateLimitError(parseRetryAfter(response));
    default:
      throw new SpotifyUnavailableError(
        `Spotify a répondu ${response.status}.`,
        detail.slice(0, 500),
      );
  }
}

/**
 * Client HTTP minimal pour l'API Spotify.
 *
 * Une instance est créée par requête entrante, avec le token d'accès déjà
 * rafraîchi par le middleware d'authentification.
 */
export class SpotifyClient {
  constructor(private readonly accessToken: string) {}

  async request<T>(options: RequestOptions): Promise<T> {
    const startedAt = Date.now();
    const response = await this.sendWithRetries(options);

    // 204 No Content : certaines mutations Spotify ne renvoient pas de corps.
    if (response.status === 204) {
      void logApiExchange({
        method: options.method ?? 'GET',
        url: buildUrl(options.path, options.query),
        status: 204,
        durationMs: Date.now() - startedAt,
        ...(options.body === undefined ? {} : { requestBody: options.body }),
      });

      return undefined as T;
    }

    // On lit le texte plutôt que le JSON pour pouvoir le journaliser tel quel.
    const rawBody = await response.text();

    void logApiExchange({
      method: options.method ?? 'GET',
      url: buildUrl(options.path, options.query),
      status: response.status,
      durationMs: Date.now() - startedAt,
      responseBody: rawBody,
      ...(options.body === undefined ? {} : { requestBody: options.body }),
    });

    // Un corps vide n'est pas réservé au 204 : Spotify répond 200 sans
    // contenu sur plusieurs mutations (désabonnement d'une playlist,
    // modification de ses métadonnées). Tenter de le parser levait une
    // SyntaxError remontée à l'utilisateur en « erreur interne ».
    if (rawBody.trim() === '') {
      return undefined as T;
    }

    return JSON.parse(rawBody) as T;
  }

  private async sendWithRetries(options: RequestOptions): Promise<Response> {
    let lastRateLimitError: SpotifyRateLimitError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await this.sendOnce(options);

      if (response.ok) {
        return response;
      }

      const isRetryable = response.status === 429 || response.status >= 500;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        await toAppError(response);
      }

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response);

        // Une attente longue est remontée à l'utilisateur plutôt que subie
        // silencieusement : mieux vaut un message clair qu'une requête figée.
        if (retryAfter > MAX_AUTO_RETRY_DELAY_SECONDS) {
          throw new SpotifyRateLimitError(retryAfter);
        }

        lastRateLimitError = new SpotifyRateLimitError(retryAfter);
        await delay(retryAfter);
      } else {
        // Back-off exponentiel simple pour les 5xx.
        await delay(2 ** attempt * 0.5);
      }
    }

    throw lastRateLimitError ?? new SpotifyUnavailableError();
  }

  private async sendOnce(options: RequestOptions): Promise<Response> {
    const { method = 'GET', path, query, body } = options;

    try {
      return await httpFetch(buildUrl(path, query), {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new SpotifyUnavailableError('Impossible de joindre l’API Spotify.', cause);
    }
  }

  /**
   * Parcourt toutes les pages d'une ressource paginée.
   *
   * Spotify plafonne à 50 éléments par page ; une playlist de 2 000 titres
   * demande donc 40 requêtes séquentielles. On reste séquentiel volontairement
   * pour ne pas déclencher le rate limit.
   */
  async fetchAllPages<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    pageSize: number,
  ): Promise<T[]> {
    const items: T[] = [];
    let offset = 0;

    for (;;) {
      const page = await this.request<SpotifyPage<T>>({
        path,
        query: { ...query, limit: pageSize, offset },
      });

      items.push(...page.items);

      const hasMore = page.next !== null && page.items.length > 0;
      if (!hasMore) {
        return items;
      }

      offset += page.items.length;
    }
  }
}
