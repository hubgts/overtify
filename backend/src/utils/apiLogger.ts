import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Journal dédié aux échanges avec l'API Spotify.
 *
 * Séparé des logs applicatifs : ceux-ci racontent ce que fait Overtify, ce
 * fichier montre ce que Spotify renvoie réellement. C'est précieux quand la
 * forme d'une réponse ne correspond pas à la documentation — cas déjà
 * rencontré avec le compteur de morceaux (`tracks` vs `items`).
 *
 * Activation : SPOTIFY_LOG_FILE dans .env. Sans cette variable, tout est inerte.
 */

const LOG_FILE = process.env.SPOTIFY_LOG_FILE;

/** Au-delà, on tronque : un corps de playlist complet ferait des mégaoctets. */
const MAX_BODY_CHARS = 20_000;

let directoryReady: Promise<void> | null = null;

function ensureDirectory(filePath: string): Promise<void> {
  directoryReady ??= mkdir(dirname(filePath), { recursive: true }).then(() => undefined);
  return directoryReady;
}

/**
 * Masque les valeurs sensibles avant écriture.
 *
 * Un fichier de logs se partage et se committe par accident : jetons et codes
 * d'autorisation ne doivent jamais y figurer en clair.
 */
function redact(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1<redacted>')
    .replace(/("(?:access|refresh)_token"\s*:\s*")[^"]*/gi, '$1<redacted>')
    .replace(/([?&](?:code|state|client_secret)=)[^&\s"]*/gi, '$1<redacted>');
}

function truncate(text: string): string {
  return text.length <= MAX_BODY_CHARS
    ? text
    : `${text.slice(0, MAX_BODY_CHARS)}… [tronqué, ${text.length} caractères au total]`;
}

export interface ApiExchange {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  /** Corps de la réponse, déjà sérialisé. */
  responseBody?: string;
  /** Corps de la requête, pour les mutations. */
  requestBody?: unknown;
}

/**
 * Écrit un échange dans le journal.
 *
 * N'échoue jamais : un problème d'écriture de log ne doit pas faire échouer la
 * requête utilisateur.
 */
export async function logApiExchange(exchange: ApiExchange): Promise<void> {
  if (LOG_FILE === undefined || LOG_FILE === '') {
    return;
  }

  try {
    await ensureDirectory(LOG_FILE);

    const entry = {
      at: new Date().toISOString(),
      method: exchange.method,
      url: redact(exchange.url),
      status: exchange.status,
      durationMs: Math.round(exchange.durationMs),
      ...(exchange.requestBody === undefined
        ? {}
        : { requestBody: JSON.parse(redact(JSON.stringify(exchange.requestBody))) as unknown }),
      ...(exchange.responseBody === undefined
        ? {}
        : { responseBody: truncate(redact(exchange.responseBody)) }),
    };

    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Journalisation best-effort : on ignore silencieusement toute erreur.
  }
}
