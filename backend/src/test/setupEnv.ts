/**
 * Variables d'environnement pour les tests.
 *
 * Fournit des valeurs factices suffisantes pour satisfaire la validation de
 * `config/env.ts`, qui s'exécute au chargement des modules.
 *
 * Les variables déjà définies sont conservées : le test de contrat
 * (`npm run test:contract`) a besoin des vraies identifiants Spotify, et les
 * écraser ici le rendrait inopérant.
 */
function setDefault(name: string, value: string): void {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

process.env.NODE_ENV = 'test';

setDefault('SPOTIFY_CLIENT_ID', 'test-client-id');
setDefault('SPOTIFY_CLIENT_SECRET', 'test-client-secret');
setDefault('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:3001/api/auth/callback');
setDefault('FRONTEND_URL', 'http://127.0.0.1:5173');
setDefault('SESSION_SECRET', 'secret-de-test-suffisamment-long-pour-zod');

// Le journal des échanges Spotify n'a pas lieu d'être pendant les tests.
process.env.SPOTIFY_LOG_FILE = '';
