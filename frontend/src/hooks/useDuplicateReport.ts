import { useMemo } from 'react';

import { detectDuplicates, type DuplicateReport } from '../services/duplicates/detectDuplicates';
import type { PlaylistTrackDto } from '../types/api';

/**
 * Analyse de doublons mémoïsée.
 *
 * La détection parcourt toute la playlist et normalise chaque titre ; sur
 * plusieurs milliers de morceaux, la refaire à chaque rendu serait coûteux.
 * Le calcul n'est relancé que si la liste des morceaux change réellement.
 */
export function useDuplicateReport(tracks: readonly PlaylistTrackDto[] | undefined): DuplicateReport {
  return useMemo(() => detectDuplicates(tracks ?? []), [tracks]);
}
