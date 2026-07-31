import { pluralize } from '../../services/format';
import type { DedupeSummary as DedupeSummaryData } from '../../services/duplicates/summary';

interface DedupeSummaryProps {
  summary: DedupeSummaryData;
}

/**
 * Bilan compact des suppressions, affiché à l'ouverture de la modale.
 *
 * Objectif : permettre de valider d'un coup d'œil, sans dérouler la liste
 * complète des occurrences. Le détail reste accessible en dépliant.
 */
export function DedupeSummary({ summary }: DedupeSummaryProps) {
  if (summary.totalRemovals === 0) {
    return (
      <p className="rounded-card bg-surface-raised px-4 py-6 text-center text-sm text-content-secondary">
        Aucune suppression sélectionnée. Dépliez le détail ci-dessous pour
        choisir les morceaux à retirer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card bg-accent/10 px-4 py-3">
        <p className="text-sm text-content-primary">
          <strong className="text-accent">{summary.totalRemovals}</strong>{' '}
          {pluralize(summary.totalRemovals, 'morceau sera retiré', 'morceaux seront retirés')}{' '}
          de la playlist, sur{' '}
          <strong>{summary.lines.length}</strong>{' '}
          {pluralize(summary.lines.length, 'titre concerné', 'titres concernés')}.
        </p>
      </div>

      {summary.fullRemovalCount > 0 && (
        <p role="alert" className="rounded-card bg-danger/15 px-4 py-3 text-sm text-danger">
          <strong>Attention :</strong> {summary.fullRemovalCount}{' '}
          {pluralize(
            summary.fullRemovalCount,
            'titre disparaîtra complètement',
            'titres disparaîtront complètement',
          )}{' '}
          de la playlist (toutes les occurrences sont sélectionnées).
        </p>
      )}

      <ul className="flex flex-col divide-y divide-white/5 rounded-card bg-surface-raised">
        {summary.lines.map((line) => (
          <li
            key={line.groupId}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate-line text-sm text-content-primary">
                {line.title}
              </span>
              <span className="block truncate-line text-xs text-content-secondary">
                {line.artist}
              </span>
            </span>

            {line.removesAllCopies && (
              <span className="shrink-0 rounded-pill bg-danger/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">
                Disparaît
              </span>
            )}

            <span
              className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${
                line.kind === 'exact'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-warning/20 text-warning'
              }`}
            >
              {line.kind === 'exact' ? 'Identique' : 'Probable'}
            </span>

            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-content-secondary">
              −{line.removedCount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
