import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from './queryKeys';

/**
 * Invalidation partagée par toutes les mutations de bibliothèque.
 *
 * Ajouter, retirer ou qualifier un morceau change à la fois le détail de la
 * playlist, la liste des playlists (compteurs), l'index de bibliothèque et la
 * file de qualification. Chaque hook énumérait auparavant les clés auxquelles
 * son auteur avait pensé : qualifier un titre laissait la vue Bibliothèque
 * périmée, et l'inverse était vrai aussi.
 *
 * Centraliser l'invalidation rend le prochain hook de mutation correct par
 * défaut.
 */
export function useInvalidateLibraryData(): (playlistId?: string) => Promise<void> {
  const queryClient = useQueryClient();

  return async (playlistId?: string) => {
    await Promise.all([
      // `exact` est indispensable : `playlistDetail` vaut `['playlists', id]`,
      // donc invalider `['playlists']` sans cette option viderait aussi le
      // détail de toutes les playlists déjà chargées.
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists, exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.library }),
      queryClient.invalidateQueries({ queryKey: queryKeys.qualificationQueue }),
      queryClient.invalidateQueries({ queryKey: queryKeys.removedPlaylists }),
      ...(playlistId === undefined
        ? []
        : [queryClient.invalidateQueries({ queryKey: queryKeys.playlistDetail(playlistId) })]),
    ]);
  };
}
