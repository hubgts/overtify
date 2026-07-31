import type { DuplicateGroup, DuplicateReport } from './detectDuplicates';
import type { RemovalSelection } from './selection';

/**
 * Résumé de ce qui va être supprimé.
 *
 * Sert à afficher un bilan compact avant validation : l'utilisateur doit
 * pouvoir juger d'un coup d'œil, sans dérouler la liste complète des
 * occurrences.
 *
 * Fonctions pures, testées unitairement (cf. summary.test.ts).
 */

/** Une ligne du résumé : un morceau et le nombre d'occurrences retirées. */
export interface SummaryLine {
  /** Identifiant du groupe d'origine, utilisable comme clé React. */
  groupId: string;
  title: string;
  artist: string;
  kind: DuplicateGroup['kind'];
  /** Nombre d'occurrences supprimées dans ce groupe. */
  removedCount: number;
  /** Vrai si le morceau disparaît entièrement de la playlist. */
  removesAllCopies: boolean;
}

export interface DedupeSummary {
  lines: SummaryLine[];
  totalRemovals: number;
  /** Nombre de morceaux qui disparaîtraient complètement. */
  fullRemovalCount: number;
}

function summarizeGroup(
  group: DuplicateGroup,
  selection: RemovalSelection,
): SummaryLine | null {
  const removedCount = group.tracks.filter((track) =>
    selection.has(track.position),
  ).length;

  if (removedCount === 0) {
    return null;
  }

  const firstTrack = group.tracks[0];

  if (firstTrack === undefined) {
    return null;
  }

  return {
    groupId: group.id,
    title: firstTrack.name,
    artist: firstTrack.artists[0] ?? 'Artiste inconnu',
    kind: group.kind,
    removedCount,
    removesAllCopies: removedCount === group.tracks.length,
  };
}

/**
 * Construit le résumé des suppressions à partir de la sélection courante.
 *
 * Les groupes sans suppression sélectionnée sont omis : le résumé ne montre
 * que ce qui va réellement changer.
 */
export function buildDedupeSummary(
  report: DuplicateReport,
  selection: RemovalSelection,
): DedupeSummary {
  const allGroups = [...report.exactGroups, ...report.probableGroups];

  const lines = allGroups.flatMap((group) => {
    const line = summarizeGroup(group, selection);
    return line === null ? [] : [line];
  });

  return {
    lines,
    totalRemovals: lines.reduce((total, line) => total + line.removedCount, 0),
    fullRemovalCount: lines.filter((line) => line.removesAllCopies).length,
  };
}
