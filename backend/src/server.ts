import { buildApp } from './app.js';
import { env } from './config/env.js';

/**
 * Point d'entrée du backend.
 *
 * Gère l'arrêt propre : sur SIGTERM/SIGINT (docker compose down, Ctrl+C),
 * Fastify termine les requêtes en cours avant de fermer.
 */
async function start(): Promise<void> {
  const app = await buildApp();

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.log.info(`Signal ${signal} reçu, arrêt en cours…`);

      app
        .close()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          app.log.error({ err: error }, "Erreur pendant l'arrêt");
          process.exit(1);
        });
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error({ err: error }, 'Impossible de démarrer le serveur');
    process.exit(1);
  }
}

start().catch((error: unknown) => {
  console.error('Échec du démarrage :', error);
  process.exit(1);
});
