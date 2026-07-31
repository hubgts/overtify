import { ApiError } from '../../api/client';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/**
 * Traduit une erreur technique en message actionnable.
 *
 * L'utilisateur n'a que faire d'un code HTTP : il doit savoir s'il faut
 * réessayer, se reconnecter, ou patienter.
 */
function toUserMessage(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
      case 'SESSION_EXPIRED':
        return {
          title: 'Session expirée',
          detail: 'Votre connexion Spotify a expiré. Reconnectez-vous pour continuer.',
        };
      case 'SPOTIFY_RATE_LIMITED':
        return {
          title: 'Trop de requêtes',
          detail:
            error.retryAfterSeconds === undefined
              ? 'Spotify limite temporairement les requêtes. Patientez un instant.'
              : `Spotify limite temporairement les requêtes. Réessayez dans ${error.retryAfterSeconds} seconde(s).`,
        };
      case 'FORBIDDEN':
        return { title: 'Action refusée', detail: error.message };
      case 'NETWORK_ERROR':
        return {
          title: 'Serveur injoignable',
          detail: 'Impossible de contacter Overtify. Vérifiez que le backend est démarré.',
        };
      default:
        return { title: 'Une erreur est survenue', detail: error.message };
    }
  }

  return {
    title: 'Une erreur est survenue',
    detail: error instanceof Error ? error.message : 'Erreur inconnue.',
  };
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { title, detail } = toUserMessage(error);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-card bg-surface-raised px-6 py-10 text-center"
    >
      <span aria-hidden="true" className="text-3xl">
        ⚠️
      </span>
      <div>
        <h2 className="text-lg font-bold text-content-primary">{title}</h2>
        <p className="mt-1 text-sm text-content-secondary">{detail}</p>
      </div>
      {onRetry !== undefined && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Bandeau d'erreur compact, pour signaler l'échec d'une action ponctuelle. */
export function InlineError({ error }: { error: unknown }) {
  const { detail } = toUserMessage(error);

  return (
    <p role="alert" className="rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
      {detail}
    </p>
  );
}
