import { isLikedSongs } from '../../services/likedSongs';
import { formatTrackCount } from '../../services/format';
import { AlbumCover } from '../ui/AlbumCover';
import type { PlaylistSummaryDto } from '../../types/api';

interface PlaylistPickerProps {
  playlists: PlaylistSummaryDto[];
  selectedIds: ReadonlySet<string>;
  /** Playlists contenant déjà le titre. */
  alreadyInIds: ReadonlySet<string>;
  onToggle: (playlistId: string) => void;
  disabled: boolean;
}

/**
 * Grille de sélection des playlists de destination.
 *
 * Sélection multiple : un même titre a souvent sa place dans plusieurs
 * playlists (« Rap FR » et « En boucle », par exemple).
 *
 * Les Titres likés sont exclus des destinations : le titre en vient déjà.
 */
export function PlaylistPicker({
  playlists,
  selectedIds,
  alreadyInIds,
  onToggle,
  disabled,
}: PlaylistPickerProps) {
  const destinations = playlists.filter((playlist) => !isLikedSongs(playlist.id));

  if (destinations.length === 0) {
    return (
      <p className="rounded-card bg-surface-raised px-4 py-6 text-center text-sm text-content-secondary">
        Vous ne possédez aucune playlist. Créez-en une dans Spotify pour pouvoir
        y ranger vos titres.
      </p>
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Playlists de destination</legend>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {destinations.map((playlist) => (
          <PlaylistOption
            key={playlist.id}
            playlist={playlist}
            isSelected={selectedIds.has(playlist.id)}
            isAlreadyIn={alreadyInIds.has(playlist.id)}
            onToggle={() => onToggle(playlist.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface PlaylistOptionProps {
  playlist: PlaylistSummaryDto;
  isSelected: boolean;
  isAlreadyIn: boolean;
  onToggle: () => void;
}

function PlaylistOption({
  playlist,
  isSelected,
  isAlreadyIn,
  onToggle,
}: PlaylistOptionProps) {
  // Trois états distincts : déjà présent (informatif), sélectionné pour ajout,
  // ou disponible. Les confondre laisserait croire à un ajout inutile.
  const stateClasses = isAlreadyIn
    ? 'border-success/40 bg-success/10'
    : isSelected
      ? 'border-accent bg-accent/15'
      : 'border-transparent bg-surface-raised hover:bg-surface-hover';

  return (
    <label
      title={
        isAlreadyIn
          ? 'Ce titre est déjà dans cette playlist — il ne sera pas ajouté une seconde fois.'
          : undefined
      }
      className={`flex cursor-pointer items-center gap-2 rounded-card border p-2 transition-colors ${stateClasses}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />

      <AlbumCover imageUrl={playlist.imageUrl} size="sm" />

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate-line text-xs font-medium ${
            isAlreadyIn
              ? 'text-success'
              : isSelected
                ? 'text-accent'
                : 'text-content-primary'
          }`}
        >
          {playlist.name}
        </span>
        <span className="block truncate-line text-[11px] text-content-secondary">
          {isAlreadyIn ? 'Déjà présent' : formatTrackCount(playlist.trackCount)}
        </span>
      </span>
    </label>
  );
}
