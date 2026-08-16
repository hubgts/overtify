import { apiClient } from './client';
import type {
  PlaylistDetailDto,
  LibraryIndexDto,
  MembershipSyncResultDto,
  PlaylistEditDto,
  PlaylistSummaryDto,
  QualificationQueueDto,
  RemovedPlaylistDto,
  QualifyResultDto,
  SearchResultDto,
  SnapshotDto,
  TrackRemovalDto,
  UserDto,
} from '../types/api';

/**
 * Points d'entrée de l'API Overtify.
 *
 * Cette couche ne contient aucune logique : elle décrit les routes disponibles
 * et leurs types. Le cache, les états de chargement et les invalidations sont
 * gérés au-dessus, dans les hooks (cf. src/hooks/).
 */

export const authApi = {
  /** Profil courant. Lève une ApiError 401 si aucune session n'est active. */
  getCurrentUser: (signal?: AbortSignal): Promise<UserDto> =>
    apiClient.get<UserDto>('/auth/me', signal),

  logout: (): Promise<void> => apiClient.post<void>('/auth/logout'),

  /**
   * Redirection vers le consentement Spotify.
   *
   * Navigation complète volontaire (et non fetch) : le flow OAuth impose que
   * le navigateur suive lui-même les redirections vers accounts.spotify.com.
   */
  redirectToLogin: (): void => {
    window.location.href = '/api/auth/login';
  },
};

export const playlistApi = {
  list: (signal?: AbortSignal): Promise<PlaylistSummaryDto[]> =>
    apiClient.get<PlaylistSummaryDto[]>('/playlists', signal),

  getDetail: (playlistId: string, signal?: AbortSignal): Promise<PlaylistDetailDto> =>
    apiClient.get<PlaylistDetailDto>(`/playlists/${playlistId}`, signal),

  /** Crée une playlist vide (privée par défaut). */
  create: (input: { name: string; description?: string; isPublic?: boolean }): Promise<PlaylistSummaryDto> =>
    apiClient.post<PlaylistSummaryDto>('/playlists', input),

  /** Renomme, ou modifie description et visibilité. */
  update: (playlistId: string, changes: PlaylistEditDto): Promise<void> =>
    apiClient.put<void>(`/playlists/${playlistId}`, changes),

  /**
   * Retire une playlist de la bibliothèque.
   *
   * Désabonnement et non suppression : la playlist reste restaurable.
   */
  remove: (playlistId: string): Promise<void> =>
    apiClient.delete<void>(`/playlists/${playlistId}`),

  /** Playlists retirées, affichées grisées. */
  listRemoved: (signal?: AbortSignal): Promise<RemovedPlaylistDto[]> =>
    apiClient.get<RemovedPlaylistDto[]>('/playlists/removed', signal),

  /** Réaffiche une playlist retirée. */
  restore: (playlistId: string): Promise<void> =>
    apiClient.post<void>(`/playlists/${playlistId}/restore`),

  addTracks: (playlistId: string, uris: string[]): Promise<SnapshotDto> =>
    apiClient.post<SnapshotDto>(`/playlists/${playlistId}/tracks`, { uris }),

  /** `snapshotId` protège contre les modifications concurrentes de la playlist. */
  removeTracks: (
    playlistId: string,
    tracks: TrackRemovalDto[],
    snapshotId: string,
  ): Promise<SnapshotDto> =>
    apiClient.delete<SnapshotDto>(`/playlists/${playlistId}/tracks`, {
      tracks,
      snapshotId,
    }),
};

export const libraryApi = {
  /** `refresh` force la reconstruction, pour intégrer une modification externe. */
  getIndex: (refresh = false, signal?: AbortSignal): Promise<LibraryIndexDto> =>
    apiClient.get<LibraryIndexDto>(`/library${refresh ? '?refresh=true' : ''}`, signal),

  /**
   * Aligne l'appartenance sur l'état voulu : ajoute et retire en une fois.
   *
   * `scopePlaylistIds` borne l'opération : toute playlist hors périmètre est
   * laissée intacte, même absente de `playlistIds`.
   */
  syncMembership: (
    uri: string,
    playlistIds: string[],
    scopePlaylistIds: string[],
  ): Promise<MembershipSyncResultDto> =>
    apiClient.post<MembershipSyncResultDto>('/library/sync', {
      uri,
      playlistIds,
      scopePlaylistIds,
    }),
};

export const qualificationApi = {
  /** File d'attente : titres restant à traiter et playlists de destination. */
  getQueue: (signal?: AbortSignal): Promise<QualificationQueueDto> =>
    apiClient.get<QualificationQueueDto>('/qualification/queue', signal),

  /** `playlistIds` vide = titre passé, marqué traité sans modification. */
  qualify: (uri: string, playlistIds: string[]): Promise<QualifyResultDto> =>
    apiClient.post<QualifyResultDto>('/qualification/qualify', { uri, playlistIds }),

  undo: (uri: string): Promise<void> =>
    apiClient.post<void>('/qualification/undo', { uri }),

  /** Efface la mémoire d'Overtify ; aucune donnée Spotify n'est touchée. */
  reset: (): Promise<void> => apiClient.post<void>('/qualification/reset'),
};

export const searchApi = {
  searchTracks: (query: string, signal?: AbortSignal): Promise<SearchResultDto> =>
    apiClient.get<SearchResultDto>(
      `/search/tracks?q=${encodeURIComponent(query)}&limit=20`,
      signal,
    ),
};
