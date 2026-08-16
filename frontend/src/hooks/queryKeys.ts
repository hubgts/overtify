/**
 * Clés de cache TanStack Query, centralisées.
 *
 * Regrouper les clés ici évite les fautes de frappe silencieuses et rend les
 * invalidations lisibles : après une mutation, on sait exactement quelle clé
 * cibler.
 */
export const queryKeys = {
  currentUser: ['auth', 'me'] as const,
  playlists: ['playlists'] as const,
  playlistDetail: (playlistId: string) => ['playlists', playlistId] as const,
  trackSearch: (query: string) => ['search', 'tracks', query] as const,
  qualificationQueue: ['qualification', 'queue'] as const,
  library: ['library'] as const,
  removedPlaylists: ['playlists', 'removed'] as const,
} as const;
