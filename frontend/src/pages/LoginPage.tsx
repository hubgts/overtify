import { authApi } from '../api/endpoints';
import { Button } from '../components/ui/Button';

/** Motifs d'échec renvoyés par le backend dans l'URL après un callback OAuth. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Vous avez refusé l’autorisation. Overtify a besoin de votre accord pour accéder à vos playlists.',
  invalid_state: 'La connexion a expiré ou a été altérée. Merci de réessayer.',
  missing_code: 'Spotify n’a pas renvoyé de code d’autorisation. Merci de réessayer.',
  token_exchange_failed:
    'Impossible de finaliser la connexion avec Spotify. Vérifiez la configuration de l’application.',
};

interface LoginPageProps {
  /** Motif d'échec extrait de l'URL, le cas échéant. */
  errorReason: string | null;
}

/** Écran de connexion, seul point d'entrée quand aucune session n'est active. */
export function LoginPage({ errorReason }: LoginPageProps) {
  const errorMessage =
    errorReason === null
      ? null
      : (AUTH_ERROR_MESSAGES[errorReason] ?? 'La connexion à Spotify a échoué.');

  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-surface-raised to-surface-base px-4">
      <div className="w-full max-w-md rounded-card bg-surface-raised p-10 text-center shadow-2xl">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-black tracking-tight">
          <span aria-hidden="true" className="text-accent">
            ◆
          </span>
          Overtify
        </h1>

        <p className="mt-3 text-sm text-content-secondary">
          Reprenez la main sur votre bibliothèque Spotify : triez vos titres
          likés, organisez vos playlists et débusquez les doublons que Spotify
          ne voit pas.
        </p>

        {errorMessage !== null && (
          <p
            role="alert"
            className="mt-6 rounded-md bg-danger/15 px-4 py-3 text-sm text-danger"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-8">
          <Button onClick={authApi.redirectToLogin} className="w-full">
            Se connecter avec Spotify
          </Button>
        </div>

        <p className="mt-6 text-xs text-content-muted">
          Overtify n’accède qu’à vos playlists et ne stocke aucun mot de passe.
          Vous pouvez révoquer l’accès à tout moment depuis votre compte Spotify.
        </p>
      </div>
    </main>
  );
}
