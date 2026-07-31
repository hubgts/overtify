import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import type { UserDto } from '../types/api';

/**
 * État d'authentification de l'utilisateur.
 *
 * Un 401 n'est pas une erreur ici : c'est l'état « non connecté », attendu au
 * premier chargement. On le convertit donc en `user: null` plutôt que de le
 * remonter comme un échec.
 */
export interface AuthState {
  user: UserDto | null;
  isLoading: boolean;
  /** Erreur réelle (serveur injoignable, panne), hors « non connecté ». */
  error: Error | null;
}

export function useAuth(): AuthState {
  const query = useQuery<UserDto | null>({
    queryKey: queryKeys.currentUser,
    queryFn: async ({ signal }) => {
      try {
        return await authApi.getCurrentUser(signal);
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          return null;
        }

        throw error;
      }
    },
    // Inutile de revalider la session à chaque focus de fenêtre.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Déconnecte l'utilisateur et vide le cache pour ne rien laisser fuiter. */
export function useLogout(): { logout: () => void; isPending: boolean } {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });

  return {
    logout: () => mutation.mutate(),
    isPending: mutation.isPending,
  };
}
