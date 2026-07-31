interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md';
}

/** Indicateur de chargement, annoncé aux lecteurs d'écran via `role="status"`. */
export function Spinner({ label = 'Chargement…', size = 'md' }: SpinnerProps) {
  const dimension = size === 'sm' ? 'h-4 w-4' : 'h-8 w-8';

  return (
    <div role="status" className="flex items-center justify-center gap-3">
      <span
        className={`${dimension} animate-spin rounded-full border-2 border-surface-active border-t-accent`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Bloc de chargement centré, pour les zones de contenu principales. */
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Spinner {...(label === undefined ? {} : { label })} />
      {label !== undefined && <p className="text-sm text-content-secondary">{label}</p>}
    </div>
  );
}
