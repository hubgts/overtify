import { formatTrackCount } from '../../services/format';
import { isLikedSongs } from '../../services/likedSongs';
import { LoadingBlock } from '../ui/Spinner';
import { InlineError } from '../ui/ErrorState';
import type { PlaylistSummaryDto } from '../../types/api';

interface SidebarProps {
  playlists: PlaylistSummaryDto[] | undefined;
  selectedPlaylistId: string | undefined;
  onSelectPlaylist: (playlistId: string) => void;
  /** Outil transverse actif, ou null si une playlist est affichée. */
  activeTool: 'qualify' | 'library' | null;
  onOpenTool: (tool: 'qualify' | 'library') => void;
  isLoading: boolean;
  error: unknown;
}

/**
 * Colonne de gauche : la bibliothèque.
 *
 * Ne contient que les playlists dont l'utilisateur est propriétaire — celles
 * qu'il suit sont filtrées côté backend, puisque Overtify ne permet de gérer
 * que ses propres playlists.
 */
export function Sidebar({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  activeTool,
  onOpenTool,
  isLoading,
  error,
}: SidebarProps) {
  return (
    <nav
      aria-label="Vos playlists"
      className="flex w-72 shrink-0 flex-col gap-2 bg-surface-base p-2"
    >
      <div className="rounded-card bg-surface-raised px-4 py-4">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span aria-hidden="true" className="text-accent">
            ◆
          </span>
          Overtify
        </h1>
      </div>

      {/*
        Outils transverses, séparés de la bibliothèque : ils portent sur
        l'ensemble des playlists plutôt que sur l'une d'elles.
      */}
      <div className="flex flex-col gap-1 rounded-card bg-surface-raised p-2">
        <ToolButton
          icon="⇄"
          label="Qualifier"
          description="Trier vos titres likés"
          isActive={activeTool === 'qualify'}
          onClick={() => onOpenTool('qualify')}
        />
        <ToolButton
          icon="◎"
          label="Bibliothèque"
          description="Où est ce morceau ?"
          isActive={activeTool === 'library'}
          onClick={() => onOpenTool('library')}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-card bg-surface-raised">
        <h2 className="px-4 py-4 text-sm font-semibold text-content-secondary">
          Vos playlists
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading && <LoadingBlock />}

          {error !== null && error !== undefined && (
            <div className="px-2">
              <InlineError error={error} />
            </div>
          )}

          {playlists?.length === 0 && (
            <p className="px-2 py-4 text-sm text-content-secondary">
              Vous ne possédez aucune playlist. Créez-en une dans Spotify pour la voir
              apparaître ici.
            </p>
          )}

          <ul>
            {playlists?.map((playlist) => (
              <li key={playlist.id}>
                <PlaylistSidebarItem
                  playlist={playlist}
                  isSelected={playlist.id === selectedPlaylistId}
                  onSelect={() => onSelectPlaylist(playlist.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

interface ToolButtonProps {
  icon: string;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

/** Entrée d'outil transverse : porte sur toute la bibliothèque, pas une playlist. */
function ToolButton({ icon, label, description, isActive, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
        isActive ? 'bg-surface-active' : 'hover:bg-surface-hover'
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-active text-base"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate-line text-sm font-medium ${
            isActive ? 'text-accent' : 'text-content-primary'
          }`}
        >
          {label}
        </span>
        <span className="block truncate-line text-xs text-content-secondary">
          {description}
        </span>
      </span>
    </button>
  );
}

interface PlaylistSidebarItemProps {
  playlist: PlaylistSummaryDto;
  isSelected: boolean;
  onSelect: () => void;
}

function PlaylistSidebarItem({ playlist, isSelected, onSelect }: PlaylistSidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
        isSelected ? 'bg-surface-active' : 'hover:bg-surface-hover'
      }`}
    >
      <PlaylistCover
        imageUrl={playlist.imageUrl}
        name={playlist.name}
        isLikedSongs={isLikedSongs(playlist.id)}
      />

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate-line text-sm font-medium ${
            isSelected ? 'text-accent' : 'text-content-primary'
          }`}
        >
          {playlist.name}
        </span>
        <span className="block truncate-line text-xs text-content-secondary">
          {formatTrackCount(playlist.trackCount)}
        </span>
      </span>
    </button>
  );
}

/** Pochette de playlist, avec repli sur une icône si Spotify n'en fournit pas. */
function PlaylistCover({
  imageUrl,
  name,
  isLikedSongs: isLiked = false,
}: {
  imageUrl: string | null;
  name: string;
  isLikedSongs?: boolean;
}) {
  // Les Titres likés n'ont pas de pochette : on reprend le dégradé et le cœur
  // de l'application Spotify pour les rendre immédiatement reconnaissables.
  if (isLiked) {
    return (
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gradient-to-br from-accent to-[#3b1e6e] text-lg text-white"
      >
        ♥
      </span>
    );
  }

  if (imageUrl === null) {
    return (
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface-active text-content-muted"
      >
        ♪
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded object-cover"
      title={name}
    />
  );
}
