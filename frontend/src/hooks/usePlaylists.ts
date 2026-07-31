import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { playlistApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import { useInvalidateLibraryData } from './useInvalidateLibraryData';
import type {
  PlaylistDetailDto,
  PlaylistSummaryDto,
  SnapshotDto,
  TrackRemovalDto,
} from '../types/api';

/**
 * Accès aux playlists de l'utilisateur.
 *
 * Après toute mutation, on invalide à la fois le détail de la playlist (les
 * positions des morceaux ont changé) et la liste (le compteur de titres aussi).
 * Recharger depuis Spotify est ici préférable à une mise à jour optimiste : les
 * positions sont la clé des suppressions, une désynchronisation ferait
 * supprimer le mauvais morceau.
 */

export function usePlaylists(enabled: boolean): UseQueryResult<PlaylistSummaryDto[]> {
  return useQuery({
    queryKey: queryKeys.playlists,
    queryFn: ({ signal }) => playlistApi.list(signal),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function usePlaylistDetail(
  playlistId: string | undefined,
): UseQueryResult<PlaylistDetailDto> {
  return useQuery({
    queryKey: queryKeys.playlistDetail(playlistId ?? ''),
    queryFn: ({ signal }) => {
      if (playlistId === undefined) {
        throw new Error('playlistId manquant');
      }

      return playlistApi.getDetail(playlistId, signal);
    },
    enabled: playlistId !== undefined,
  });
}


export function useAddTracks(playlistId: string) {
  const invalidate = useInvalidateLibraryData();

  return useMutation<SnapshotDto, Error, string[]>({
    mutationFn: (uris) => playlistApi.addTracks(playlistId, uris),
    onSuccess: () => invalidate(playlistId),
  });
}

export interface RemoveTracksInput {
  tracks: TrackRemovalDto[];
  snapshotId: string;
}

export function useRemoveTracks(playlistId: string) {
  const invalidate = useInvalidateLibraryData();

  return useMutation<SnapshotDto, Error, RemoveTracksInput>({
    mutationFn: ({ tracks, snapshotId }) =>
      playlistApi.removeTracks(playlistId, tracks, snapshotId),
    onSuccess: () => invalidate(playlistId),
  });
}
