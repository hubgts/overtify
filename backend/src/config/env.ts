import { z } from 'zod';

/**
 * Schéma des variables d'environnement.
 *
 * La validation est faite au démarrage : mieux vaut un crash immédiat et
 * explicite qu'une erreur OAuth incompréhensible à la première connexion.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  SPOTIFY_CLIENT_ID: z.string().min(1, 'SPOTIFY_CLIENT_ID est requis'),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, 'SPOTIFY_CLIENT_SECRET est requis'),
  /** Doit être déclarée à l'identique dans le Spotify Developer Dashboard. */
  SPOTIFY_REDIRECT_URI: z.string().url('SPOTIFY_REDIRECT_URI doit être une URL valide'),

  /** Origine du frontend, pour le CORS et la redirection post-login. */
  FRONTEND_URL: z.string().url('FRONTEND_URL doit être une URL valide'),

  /** Secret de signature des cookies. Doit être long et aléatoire en production. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
