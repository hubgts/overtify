import { useEffect, useState } from 'react';

import { useAuth, useLogout } from './hooks/useAuth';
import { usePlaylists, useRemovePlaylist, useUpdatePlaylist } from './hooks/usePlaylists';
import { CreatePlaylistModal } from './components/playlist/CreatePlaylistModal';
import { PlaylistFormModal } from './components/playlist/PlaylistFormModal';
import { RemovePlaylistModal } from './components/playlist/RemovePlaylistModal';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { LoginPage } from './pages/LoginPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { QualifyPage } from './pages/QualifyPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoadingBlock } from './components/ui/Spinner';
import { ErrorState } from './components/ui/ErrorState';
import type { PlaylistSummaryDto } from './types/api';

/**
 * Lit puis efface les paramètres `auth` et `reason` posés par le backend après
 * un retour de callback OAuth.
 *
 * Le nettoyage évite qu'un rechargement de page réaffiche indéfiniment une
 * erreur de connexion déjà traitée.
 */
function useAuthRedirectResult(): string | null {
  const [errorReason, setErrorReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (!params.has('auth')) {
      return;
    }

    setErrorReason(params.get('auth') === 'error' ? (params.get('reason') ?? 'unknown') : null);

    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  return errorReason;
}

export function App() {
  const authErrorReason = useAuthRedirectResult();
  const { user, isLoading: isAuthLoading, error: authError } = useAuth();
  const { logout, isPending: isLoggingOut } = useLogout();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<'playlist' | 'qualify' | 'library'>('playlist');

  const playlistsQuery = usePlaylists(user !== null);

  const updatePlaylist = useUpdatePlaylist();
  const removePlaylist = useRemovePlaylist();

  /** Modale ouverte : création, édition d'une playlist, ou retrait. */
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [playlistToEdit, setPlaylistToEdit] = useState<PlaylistSummaryDto | null>(null);
  const [playlistToRemove, setPlaylistToRemove] = useState<PlaylistSummaryDto | null>(null);

  if (isAuthLoading) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <LoadingBlock label="Connexion à Spotify…" />
      </main>
    );
  }

  // Erreur réelle (backend injoignable), distincte de l'état « non connecté ».
  if (authError !== null) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <ErrorState error={authError} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  if (user === null) {
    return <LoginPage errorReason={authErrorReason} />;
  }

  return (
    <div className="flex h-full gap-2 bg-surface-base p-2">
      <Sidebar
        playlists={playlistsQuery.data}
        selectedPlaylistId={view === 'playlist' ? selectedPlaylistId : undefined}
        onSelectPlaylist={(playlistId) => {
          setSelectedPlaylistId(playlistId);
          setView('playlist');
        }}
        activeTool={view === 'playlist' ? null : view}
        onOpenTool={setView}
        onCreatePlaylist={() => setCreateOpen(true)}
        onEditPlaylist={setPlaylistToEdit}
        onRemovePlaylist={setPlaylistToRemove}
        isLoading={playlistsQuery.isLoading}
        error={playlistsQuery.error}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-card bg-surface-raised">
        <TopBar user={user} onLogout={logout} isLoggingOut={isLoggingOut} />

        {view === 'qualify' ? (
          <QualifyPage />
        ) : view === 'library' ? (
          <LibraryPage />
        ) : selectedPlaylistId === undefined ? (
          <EmptySelectionState />
        ) : (
          <PlaylistPage key={selectedPlaylistId} playlistId={selectedPlaylistId} />
        )}
      </main>

      {isCreateOpen && (
        <CreatePlaylistModal
          onClose={() => setCreateOpen(false)}
          description="Elle sera créée vide et privée."
          onCreated={(created) => {
            // On ouvre la playlist créée : elle est vide, l'utilisateur veut
            // la remplir dans la foulée.
            setSelectedPlaylistId(created.id);
            setView('playlist');
          }}
        />
      )}

      {playlistToEdit !== null && (
        <PlaylistFormModal
          onClose={() => setPlaylistToEdit(null)}
          initialValues={{
            name: playlistToEdit.name,
            description: playlistToEdit.description ?? '',
          }}
          onSubmit={(values) => {
            updatePlaylist.mutate(
              {
                playlistId: playlistToEdit.id,
                changes: { name: values.name, description: values.description },
              },
              { onSuccess: () => setPlaylistToEdit(null) },
            );
          }}
          isPending={updatePlaylist.isPending}
          error={updatePlaylist.error}
          title="Renommer la playlist"
          description="Le nom et la description sont modifiés dans Spotify."
          submitLabel="Enregistrer"
        />
      )}

      <RemovePlaylistModal
        playlist={playlistToRemove}
        onClose={() => setPlaylistToRemove(null)}
        onConfirm={() => {
          if (playlistToRemove === null) {
            return;
          }

          removePlaylist.mutate(playlistToRemove.id, {
            onSuccess: () => {
              // La playlist retirée ne doit plus rester affichée.
              if (selectedPlaylistId === playlistToRemove.id) {
                setSelectedPlaylistId(undefined);
              }

              setPlaylistToRemove(null);
            },
          });
        }}
        isPending={removePlaylist.isPending}
        error={removePlaylist.error}
      />
    </div>
  );
}

function EmptySelectionState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span aria-hidden="true" className="text-5xl">
        ◆
      </span>
      <h2 className="text-2xl font-bold">Sélectionnez une playlist</h2>
      <p className="max-w-sm text-sm text-content-secondary">
        Choisissez une playlist dans la colonne de gauche pour en consulter les
        morceaux, y ajouter des titres ou la dédoublonner.
      </p>
    </div>
  );
}
