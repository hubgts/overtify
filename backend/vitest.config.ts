import { defineConfig } from 'vitest/config';

/**
 * Configuration des tests backend.
 *
 * `setupFiles` fournit une configuration d'environnement factice : les modules
 * importent `config/env.ts`, qui valide les variables au chargement et lèverait
 * sinon une erreur. Les tests restent ainsi exécutables sans fichier `.env`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setupEnv.ts'],
    include: ['src/**/*.test.ts'],
    // Le test de contrat interroge la vraie API Spotify : exclu de la suite
    // par défaut pour que `npm test` reste hors ligne et déterministe.
    // `npm run test:contract` le réactive via RUN_CONTRACT_TESTS.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...(process.env.RUN_CONTRACT_TESTS === '1'
        ? []
        : ['src/e2e/spotifyContract.test.ts']),
    ],
  },
});
