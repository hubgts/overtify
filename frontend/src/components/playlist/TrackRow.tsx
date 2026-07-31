import { formatArtists, formatDuration } from '../../services/format';
import { AlbumCover } from '../ui/AlbumCover';
import type { PlaylistTrackDto } from '../../types/api';

interface TrackRowProps {
  track: PlaylistTrackDto;
  /** Numéro affiché (1-based), indépendant de la position technique. */
  displayIndex: number;
  onRemove: (track: PlaylistTrackDto) => void;
  isRemoving: boolean;
}

/**
 * Une ligne de la table des morceaux.
 *
 * Le bouton de suppression n'apparaît qu'au survol ou au focus clavier, comme
 * dans Spotify — mais il reste dans le DOM en permanence pour rester
 * atteignable au clavier et annonçable par un lecteur d'écran.
 */
export function TrackRow({ track, displayIndex, onRemove, isRemoving }: TrackRowProps) {
  return (
    <tr className="group border-b border-white/5 transition-colors hover:bg-surface-hover">
      <td className="w-12 px-4 py-2 text-right text-sm tabular-nums text-content-secondary">
        {displayIndex}
      </td>

      <td className="px-2 py-2">
        <div className="flex items-center gap-3">
          <AlbumCover imageUrl={track.albumImageUrl} />

          <div className="min-w-0">
            <p className="truncate-line text-sm font-medium text-content-primary">
              {track.name}
              {track.isLocal && (
                <span className="ml-2 rounded bg-surface-active px-1.5 py-0.5 text-[10px] uppercase text-content-secondary">
                  local
                </span>
              )}
            </p>
            <p className="truncate-line text-xs text-content-secondary">
              {formatArtists(track.artists)}
            </p>
          </div>
        </div>
      </td>

      <td className="hidden px-2 py-2 text-sm text-content-secondary md:table-cell">
        <span className="truncate-line block max-w-xs">{track.albumName}</span>
      </td>

      <td className="w-20 px-2 py-2 text-right text-sm tabular-nums text-content-secondary">
        {formatDuration(track.durationMs)}
      </td>

      <td className="w-12 px-4 py-2 text-right">
        <button
          type="button"
          onClick={() => onRemove(track)}
          disabled={isRemoving}
          aria-label={`Supprimer ${track.name} de la playlist`}
          className="rounded-full p-1.5 text-content-secondary opacity-0 transition-all hover:bg-surface-active hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </td>
    </tr>
  );
}
