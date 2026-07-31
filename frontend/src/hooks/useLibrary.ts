import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { libraryApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import { useInvalidateLibraryData } from './useInvalidateLibraryData';
import type { LibraryIndexDto, MembershipSyncResultDto } from '../types/api';

/**
 * Index de la bibliothèque.
 *
 * Sa construction coûte une vingtaine de requêtes Spotify côté serveur, qui le
 * met en cache. Le front conserve donc lui aussi le résultat longtemps : le
 * serveur invalide son cache à chaque mutation, et un rafraîchissement manuel
 * reste disponible pour les modifications faites depuis Spotify.
 */
export function useLibrary(): UseQueryResult<LibraryIndexDto> {
  return useQuery({
    queryKey: queryKeys.library,
    queryFn: ({ signal }) => libraryApi.getIndex(false, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/** Reconstruit l'index côté serveur, en ignorant les caches. */
export function useRefreshLibrary() {
  const queryClient = useQueryClient();

  return useMutation<LibraryIndexDto, Error, void>({
    mutationFn: () => libraryApi.getIndex(true),
    onSuccess: (index) => {
      queryClient.setQueryData(queryKeys.library, index);
    },
  });
}


export interface SyncMembershipInput {
  uri: string;
  /** Playlists devant contenir le morceau après l'opération. */
  playlistIds: string[];
  /** Playlists concernées ; les autres restent intactes. */
  scopePlaylistIds: string[];
}

/**
 * Aligne l'appartenance d'un morceau : ajouts et retraits en une opération.
 *
 * L'index et les playlists sont invalidés : emplacements et compteurs ont
 * changé.
 */
export function useSyncMembership() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<MembershipSyncResultDto, Error, SyncMembershipInput>({
    mutationFn: ({ uri, playlistIds, scopePlaylistIds }) =>
      libraryApi.syncMembership(uri, playlistIds, scopePlaylistIds),
    onSuccess: () => invalidate(),
  });
}
