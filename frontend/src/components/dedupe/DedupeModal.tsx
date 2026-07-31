import { useEffect, useMemo, useState } from 'react';

import {
  buildInitialSelection,
  keepOnly,
  toRemovalPayload,
  toggleGroup,
  toggleSelection,
  type RemovalSelection,
} from '../../services/duplicates/selection';
import {
  hasDuplicates,
  type DuplicateGroup,
  type DuplicateReport,
} from '../../services/duplicates/detectDuplicates';
import { buildDedupeSummary } from '../../services/duplicates/summary';
import { pluralize } from '../../services/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InlineError } from '../ui/ErrorState';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { DedupeSummary } from './DedupeSummary';
import type { TrackRemovalDto } from '../../types/api';

interface DedupeModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DuplicateReport;
  onConfirm: (removals: TrackRemovalDto[]) => void;
  isSubmitting: boolean;
  error: unknown;
}

/**
 * Modale de dédoublonnage : la fonctionnalité centrale d'Overtify.
 *
 * Parcours en deux temps :
 *  1. un **résumé** de ce qui va être supprimé, suffisant pour valider ;
 *  2. le **détail** dépliable, pour arbitrer occurrence par occurrence.
 *
 * Principe non négociable : rien n'est supprimé sans validation explicite.
 * Les doublons identiques sont présélectionnés (aucune ambiguïté), les
 * probables sont laissés décochés — ce sont des suppositions.
 */
export function DedupeModal({
  isOpen,
  onClose,
  report,
  onConfirm,
  isSubmitting,
  error,
}: DedupeModalProps) {
  const [selection, setSelection] = useState<RemovalSelection>(() => new Set<number>());
  const [isDetailOpen, setDetailOpen] = useState(false);

  // Réinitialise à chaque ouverture : rouvrir la modale après une suppression
  // ne doit pas conserver des positions devenues obsolètes.
  useEffect(() => {
    if (isOpen) {
      setSelection(buildInitialSelection(report));
      setDetailOpen(false);
    }
  }, [isOpen, report]);

  const removals = useMemo(() => toRemovalPayload(report, selection), [report, selection]);
  const summary = useMemo(() => buildDedupeSummary(report, selection), [report, selection]);

  const handleToggleTrack = (position: number): void => {
    setSelection((current) => toggleSelection(current, position));
  };

  const handleKeepOnly = (group: DuplicateGroup, positionToKeep: number): void => {
    setSelection((current) => keepOnly(current, group, positionToKeep));
  };

  const handleToggleAllInSection = (groups: DuplicateGroup[], shouldSelect: boolean): void => {
    setSelection((current) =>
      groups.reduce<RemovalSelection>(
        (accumulator, group) => toggleGroup(accumulator, group, shouldSelect),
        current,
      ),
    );
  };

  const removalCount = removals.length;
  const playlistHasDuplicates = hasDuplicates(report);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dédoublonner la playlist"
      description="Vérifiez le résumé, puis validez. Rien n'est supprimé avant votre confirmation."
      size="lg"
      footer={
        <>
          <span className="mr-auto text-sm text-content-secondary">
            {removalCount === 0
              ? 'Aucune suppression sélectionnée'
              : `${removalCount} ${pluralize(removalCount, 'suppression', 'suppressions')}`}
          </span>

          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>

          <Button
            variant="danger"
            onClick={() => onConfirm(removals)}
            disabled={removalCount === 0 || isSubmitting}
          >
            {isSubmitting
              ? 'Suppression…'
              : `Supprimer ${removalCount} ${pluralize(removalCount, 'morceau', 'morceaux')}`}
          </Button>
        </>
      }
    >
      {error !== null && error !== undefined && (
        <div className="mb-4">
          <InlineError error={error} />
        </div>
      )}

      {!playlistHasDuplicates ? (
        <EmptyDuplicateState />
      ) : (
        <div className="flex flex-col gap-4">
          <DedupeSummary summary={summary} />

          <details
            open={isDetailOpen}
            onToggle={(event) => setDetailOpen(event.currentTarget.open)}
            className="rounded-card bg-surface-raised"
          >
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-content-secondary transition-colors hover:text-content-primary">
              Ajuster la sélection en détail
            </summary>

            <div className="flex flex-col gap-6 border-t border-white/5 px-4 py-4">
              <DuplicateSection
                title="Doublons identiques"
                description="Exactement le même enregistrement, présent plusieurs fois. Les occurrences en trop sont présélectionnées."
                groups={report.exactGroups}
                selection={selection}
                onToggleTrack={handleToggleTrack}
                onKeepOnly={handleKeepOnly}
                onToggleAll={handleToggleAllInSection}
              />

              <DuplicateSection
                title="Doublons probables"
                description="Même titre et même artiste, mais enregistrements différents (remaster, version single…). À vérifier avant de supprimer."
                groups={report.probableGroups}
                selection={selection}
                onToggleTrack={handleToggleTrack}
                onKeepOnly={handleKeepOnly}
                onToggleAll={handleToggleAllInSection}
              />
            </div>
          </details>
        </div>
      )}
    </Modal>
  );
}

interface DuplicateSectionProps {
  title: string;
  description: string;
  groups: DuplicateGroup[];
  selection: RemovalSelection;
  onToggleTrack: (position: number) => void;
  onKeepOnly: (group: DuplicateGroup, positionToKeep: number) => void;
  onToggleAll: (groups: DuplicateGroup[], shouldSelect: boolean) => void;
}

function DuplicateSection({
  title,
  description,
  groups,
  selection,
  onToggleTrack,
  onKeepOnly,
  onToggleAll,
}: DuplicateSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-content-primary">
            {title}{' '}
            <span className="font-normal text-content-secondary">({groups.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-content-secondary">{description}</p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onToggleAll(groups, true)}
            className="rounded-pill px-2 py-1 text-[11px] text-content-secondary transition-colors hover:bg-surface-active hover:text-content-primary"
          >
            Tout sélectionner
          </button>
          <button
            type="button"
            onClick={() => onToggleAll(groups, false)}
            className="rounded-pill px-2 py-1 text-[11px] text-content-secondary transition-colors hover:bg-surface-active hover:text-content-primary"
          >
            Tout désélectionner
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <DuplicateGroupCard
            key={group.id}
            group={group}
            selection={selection}
            onToggleTrack={onToggleTrack}
            onKeepOnly={(positionToKeep) => onKeepOnly(group, positionToKeep)}
          />
        ))}
      </ul>
    </section>
  );
}

function EmptyDuplicateState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">
        ✨
      </span>
      <div>
        <p className="font-semibold text-content-primary">Aucun doublon détecté</p>
        <p className="mt-1 text-sm text-content-secondary">
          Cette playlist est déjà propre.
        </p>
      </div>
    </div>
  );
}
