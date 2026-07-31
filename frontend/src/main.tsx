import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './App';
import { ApiError } from './api/client';
import './styles/theme.css';

/**
 * Configuration globale du cache.
 *
 * Politique de réessai : on ne réessaie jamais une erreur d'authentification
 * ni une erreur de droits — l'échec est définitif et réessayer ne ferait
 * qu'ajouter du bruit et consommer du quota Spotify.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.isAuthError || error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') {
            return false;
          }
        }

        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error("L'élément racine #root est introuvable dans index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
