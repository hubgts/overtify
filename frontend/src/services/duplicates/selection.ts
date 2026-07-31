import type { DuplicateGroup, DuplicateReport } from './detectDuplicates';
import type { PlaylistTrackDto, TrackRemovalDto } from '../../types/api';

/**
 * État de sélection de la modale de dédoublonnage.
 *
 * La sélection est représentée par l'ensemble des positions à SUPPRIMER.
 * La position est la seule coordonnée réellement unique dans une playlist :
 * l'`uri` ne l'est pas (c'est précisément le sujet), et l'index de rendu
 * changerait au moindre tri.
 */
export type RemovalSelection = ReadonlySet<number>;

/**
 * Sélection initiale proposée à l'utilisateur.
 *
 * Règle : dans chaque groupe, on conserve la première occurrence et on
 * pré-coche les suivantes.
 *
 * - Groupes exacts : pré-cochés, car il n'y a aucune ambiguïté.
 * - Groupes probables : laissés décochés. Ce sont des suppositions ; rien ne
 *   doit pouvoir être supprimé sans un geste explicite de l'utilisateur.
 */
export function buildInitialSelection(report: DuplicateReport): Set<number> {
  const selection = new Set<number>();

  for (const group of report.exactGroups) {
    for (const track of group.tracks.slice(1)) {
      selection.add(track.position);
    }
  }

  return selection;
}

export function toggleSelection(
  selection: RemovalSelection,
  position: number,
): Set<number> {
  const next = new Set(selection);

  if (next.has(position)) {
    next.delete(position);
  } else {
    next.add(position);
  }

  return next;
}

/**
 * Sélectionne (ou désélectionne) toutes les occurrences d'un groupe sauf celle
 * à conserver.
 */
export function toggleGroup(
  selection: RemovalSelection,
  group: DuplicateGroup,
  shouldSelect: boolean,
): Set<number> {
  const next = new Set(selection);

  for (const track of group.tracks.slice(1)) {
    if (shouldSelect) {
      next.add(track.position);
    } else {
      next.delete(track.position);
    }
  }

  return next;
}

/**
 * Désigne l'occurrence à conserver dans un groupe : toutes les autres sont
 * marquées pour suppression.
 *
 * C'est ce qui permet à l'utilisateur de garder la version remasterisée
 * plutôt que la plus ancienne, par exemple.
 */
export function keepOnly(
  selection: RemovalSelection,
  group: DuplicateGroup,
  positionToKeep: number,
): Set<number> {
  const next = new Set(selection);

  for (const track of group.tracks) {
    if (track.position === positionToKeep) {
      next.delete(track.position);
    } else {
      next.add(track.position);
    }
  }

  return next;
}

/** Vrai si toutes les occurrences d'un groupe sont marquées pour suppression. */
export function isGroupFullySelected(
  selection: RemovalSelection,
  group: DuplicateGroup,
): boolean {
  return group.tracks.every((track) => selection.has(track.position));
}

/**
 * Convertit la sélection en liste d'occurrences pour l'API.
 *
 * On repart des groupes plutôt que d'une liste de positions brutes, ce qui
 * garantit que chaque position est bien associée à l'`uri` correspondant —
 * un décalage entre les deux ferait supprimer le mauvais morceau.
 */
export function toRemovalPayload(
  report: DuplicateReport,
  selection: RemovalSelection,
): TrackRemovalDto[] {
  const allTracks: PlaylistTrackDto[] = [
    ...report.exactGroups.flatMap((group) => group.tracks),
    ...report.probableGroups.flatMap((group) => group.tracks),
  ];

  const seenPositions = new Set<number>();
  const removals: TrackRemovalDto[] = [];

  for (const track of allTracks) {
    if (selection.has(track.position) && !seenPositions.has(track.position)) {
      seenPositions.add(track.position);
      removals.push({ uri: track.uri, position: track.position });
    }
  }

  return removals;
}
