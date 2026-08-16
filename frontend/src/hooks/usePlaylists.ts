import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { playlistApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import { useInvalidateLibraryData } from './useInvalidateLibraryData';
import type {
  PlaylistDetailDto,
  PlaylistEditDto,
  PlaylistSummaryDto,
  RemovedPlaylistDto,
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

/** Playlists retirées de la bibliothèque, affichées grisées. */
export function useRemovedPlaylists(enabled: boolean): UseQueryResult<RemovedPlaylistDto[]> {
  return useQuery({
    queryKey: queryKeys.removedPlaylists,
    queryFn: ({ signal }) => playlistApi.listRemoved(signal),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCreatePlaylist() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<PlaylistSummaryDto, Error, { name: string; description?: string }>({
    mutationFn: (input) => playlistApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export interface UpdatePlaylistInput {
  playlistId: string;
  changes: PlaylistEditDto;
}

export function useUpdatePlaylist() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<void, Error, UpdatePlaylistInput>({
    mutationFn: ({ playlistId, changes }) => playlistApi.update(playlistId, changes),
    onSuccess: (_result, { playlistId }) => invalidate(playlistId),
  });
}

/**
 * Retire une playlist de la bibliothèque.
 *
 * Désabonnement et non suppression : la playlist reste restaurable, ce que
 * l'interface doit refléter dans son vocabulaire.
 */
export function useRemovePlaylist() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<void, Error, string>({
    mutationFn: (playlistId) => playlistApi.remove(playlistId),
    onSuccess: () => invalidate(),
  });
}

export function useRestorePlaylist() {
  const invalidate = useInvalidateLibraryData();

  return useMutation<void, Error, string>({
    mutationFn: (playlistId) => playlistApi.restore(playlistId),
    onSuccess: () => invalidate(),
  });
}
