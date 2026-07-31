import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { useInvalidateLibraryData } from './useInvalidateLibraryData';

import { qualificationApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import type { QualificationQueueDto, QualifyResultDto } from '../types/api';

/**
 * Qualification des titres likés.
 *
 * La file est rechargée après chaque décision plutôt que mise à jour
 * localement : c'est le serveur qui détient la mémoire des titres traités, et
 * une divergence ferait réapparaître un titre déjà rangé.
 */
export function useQualificationQueue(): UseQueryResult<QualificationQueueDto> {
  return useQuery({
    queryKey: queryKeys.qualificationQueue,
    queryFn: ({ signal }) => qualificationApi.getQueue(signal),
  });
}

export interface QualifyInput {
  uri: string;
  /** Vide = « Passer » : marqué traité, sans modification côté Spotify. */
  playlistIds: string[];
}

export function useQualifyTrack() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<QualifyResultDto, Error, QualifyInput>({
    mutationFn: ({ uri, playlistIds }) => qualificationApi.qualify(uri, playlistIds),
    onSuccess: () => invalidate(),
  });
}

export function useResetQualifications() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () => qualificationApi.reset(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.qualificationQueue }),
  });
}
