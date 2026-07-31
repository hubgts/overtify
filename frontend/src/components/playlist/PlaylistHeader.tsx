import { formatTrackCount } from '../../services/format';
import { isLikedSongs } from '../../services/likedSongs';
import { Button } from '../ui/Button';
import type { PlaylistDetailDto } from '../../types/api';

interface PlaylistHeaderProps {
  playlist: PlaylistDetailDto;
  duplicateCount: number;
  onOpenAddTrack: () => void;
  onOpenDedupe: () => void;
}

/**
 * En-tête d'une playlist : identité et actions principales.
 *
 * Le bouton de dédoublonnage affiche le nombre d'occurrences supprimables,
 * ce qui évite d'ouvrir la modale pour découvrir qu'il n'y a rien à faire.
 */
export function PlaylistHeader({
  playlist,
  duplicateCount,
  onOpenAddTrack,
  onOpenDedupe,
}: PlaylistHeaderProps) {
  return (
    <header className="flex flex-col gap-6 bg-gradient-to-b from-surface-active to-surface-raised px-6 pb-6 pt-4">
      <div className="flex items-end gap-6">
        {isLikedSongs(playlist.id) ? (
          <span
            aria-hidden="true"
            className="flex h-40 w-40 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-accent to-[#3b1e6e] text-6xl text-white shadow-2xl"
          >
            ♥
          </span>
        ) : playlist.imageUrl === null ? (
          <span
            aria-hidden="true"
            className="flex h-40 w-40 shrink-0 items-center justify-center rounded-card bg-surface-overlay text-5xl text-content-muted shadow-2xl"
          >
            ♪
          </span>
        ) : (
          <img
            src={playlist.imageUrl}
            alt=""
            className="h-40 w-40 shrink-0 rounded-card object-cover shadow-2xl"
          />
        )}

        <div className="min-w-0 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
            {isLikedSongs(playlist.id) ? 'Collection' : 'Playlist'}
          </p>
          <h2 className="mt-2 truncate-line text-4xl font-black tracking-tight">
            {playlist.name}
          </h2>

          {playlist.description !== null && playlist.description !== '' && (
            <p className="mt-2 truncate-line text-sm text-content-secondary">
              {playlist.description}
            </p>
          )}

          <p className="mt-2 text-sm text-content-secondary">
            <span className="font-medium text-content-primary">{playlist.ownerName}</span>
            {' · '}
            {formatTrackCount(playlist.tracks.length)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onOpenAddTrack}>
          <span aria-hidden="true">+</span> Ajouter un morceau
        </Button>

        {/*
          Toujours actionnable, même sans doublon : ouvrir la modale et lire
          « aucun doublon détecté » est plus rassurant qu'un bouton grisé, qui
          laisse penser à un dysfonctionnement.
        */}
        <Button variant="secondary" onClick={onOpenDedupe}>
          <span aria-hidden="true">⧉</span>
          {duplicateCount === 0
            ? 'Dédoublonner'
            : `Dédoublonner (${duplicateCount})`}
        </Button>
      </div>
    </header>
  );
}
