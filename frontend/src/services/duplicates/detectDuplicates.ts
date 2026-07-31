import { buildMatchKey } from './normalize';
import type { PlaylistTrackDto } from '../../types/api';

/**
 * Détection des doublons d'une playlist.
 *
 * Deux niveaux, volontairement distincts car ils n'ont pas le même degré de
 * certitude :
 *
 *  - EXACT    : même `uri` Spotify. C'est rigoureusement le même
 *               enregistrement, aucune ambiguïté possible.
 *  - PROBABLE : titre et artiste principal identiques après normalisation,
 *               mais `uri` différents. Il s'agit très probablement du même
 *               morceau dans deux éditions (remaster, single vs album), mais
 *               cela reste une heuristique — d'où une validation humaine
 *               obligatoire avant toute suppression.
 *
 * Fonctions pures, sans dépendance à React ni au réseau : c'est ce qui les
 * rend testables unitairement (cf. detectDuplicates.test.ts).
 */

export type DuplicateKind = 'exact' | 'probable';

/**
 * Un groupe de morceaux considérés comme doublons entre eux.
 *
 * `tracks` est trié par position croissante : le premier élément est
 * l'occurrence la plus ancienne, celle qu'on propose de conserver par défaut.
 */
export interface DuplicateGroup {
  /** Identifiant stable, utilisable comme clé React. */
  id: string;
  kind: DuplicateKind;
  tracks: PlaylistTrackDto[];
}

export interface DuplicateReport {
  exactGroups: DuplicateGroup[];
  probableGroups: DuplicateGroup[];
}

/** Regroupe les éléments par clé, en conservant l'ordre d'apparition. */
function groupBy<T>(items: readonly T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, [item]);
    } else {
      existing.push(item);
    }
  }

  return groups;
}

function byPosition(a: PlaylistTrackDto, b: PlaylistTrackDto): number {
  return a.position - b.position;
}

/**
 * Analyse une playlist et retourne ses groupes de doublons.
 *
 * Les titres locaux sont ignorés : l'API Spotify ne permet pas de les
 * manipuler de façon fiable, les proposer à la suppression mènerait à un échec.
 */
export function detectDuplicates(tracks: readonly PlaylistTrackDto[]): DuplicateReport {
  const manageableTracks = tracks.filter((track) => !track.isLocal);

  const exactGroups = buildExactGroups(manageableTracks);
  const probableGroups = buildProbableGroups(manageableTracks, exactGroups);

  return { exactGroups, probableGroups };
}

function buildExactGroups(tracks: readonly PlaylistTrackDto[]): DuplicateGroup[] {
  const byUri = groupBy(tracks, (track) => track.uri);

  return [...byUri.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([uri, group]) => ({
      id: `exact:${uri}`,
      kind: 'exact' as const,
      tracks: [...group].sort(byPosition),
    }))
    .sort((a, b) => (a.tracks[0]?.position ?? 0) - (b.tracks[0]?.position ?? 0));
}

/**
 * Construit les groupes « probables ».
 *
 * Un groupe n'est retenu que s'il rassemble au moins deux `uri` distincts :
 * sinon il ne s'agit que de répétitions du même enregistrement, déjà couvertes
 * par les groupes exacts. Cette règle évite qu'un même morceau soit présenté
 * deux fois à l'utilisateur, dans deux catégories différentes.
 *
 * Pour chaque `uri`, seule la première occurrence est présentée : les
 * répétitions suivantes relèvent du dédoublonnage exact.
 */
function buildProbableGroups(
  tracks: readonly PlaylistTrackDto[],
  exactGroups: readonly DuplicateGroup[],
): DuplicateGroup[] {
  const positionsHandledByExact = new Set(
    exactGroups.flatMap((group) => group.tracks.slice(1).map((track) => track.position)),
  );

  const remainingTracks = tracks.filter(
    (track) => !positionsHandledByExact.has(track.position),
  );

  const byMatchKey = groupBy(remainingTracks, (track) =>
    buildMatchKey(track.name, track.artists),
  );

  return [...byMatchKey.entries()]
    .filter(([, group]) => new Set(group.map((track) => track.uri)).size > 1)
    .map(([key, group]) => ({
      id: `probable:${key}`,
      kind: 'probable' as const,
      tracks: [...group].sort(byPosition),
    }))
    .sort((a, b) => (a.tracks[0]?.position ?? 0) - (b.tracks[0]?.position ?? 0));
}

/** Nombre total d'occurrences supprimables si l'on ne garde qu'un titre par groupe. */
export function countRemovableTracks(report: DuplicateReport): number {
  const countExcess = (groups: readonly DuplicateGroup[]): number =>
    groups.reduce((total, group) => total + group.tracks.length - 1, 0);

  return countExcess(report.exactGroups) + countExcess(report.probableGroups);
}

export function hasDuplicates(report: DuplicateReport): boolean {
  return report.exactGroups.length > 0 || report.probableGroups.length > 0;
}
