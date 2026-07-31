import { TrackRow } from './TrackRow';
import type { PlaylistTrackDto } from '../../types/api';

interface TrackTableProps {
  tracks: PlaylistTrackDto[];
  onRemoveTrack: (track: PlaylistTrackDto) => void;
  removingPosition: number | null;
}

/**
 * Table des morceaux d'une playlist.
 *
 * Composant purement présentationnel : il reçoit les données et remonte les
 * intentions, sans jamais appeler l'API lui-même.
 */
export function TrackTable({ tracks, onRemoveTrack, removingPosition }: TrackTableProps) {
  if (tracks.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-sm text-content-secondary">
        Cette playlist est vide. Utilisez « Ajouter un morceau » pour la remplir.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-surface-raised/95 backdrop-blur">
        <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-content-secondary">
          <th scope="col" className="w-12 px-4 py-2 text-right font-normal">
            #
          </th>
          <th scope="col" className="px-2 py-2 font-normal">
            Titre
          </th>
          <th scope="col" className="hidden px-2 py-2 font-normal md:table-cell">
            Album
          </th>
          <th scope="col" className="w-20 px-2 py-2 text-right font-normal">
            Durée
          </th>
          <th scope="col" className="w-12 px-4 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>

      <tbody>
        {tracks.map((track, index) => (
          <TrackRow
            key={`${track.uri}-${track.position}`}
            track={track}
            displayIndex={index + 1}
            onRemove={onRemoveTrack}
            isRemoving={removingPosition === track.position}
          />
        ))}
      </tbody>
    </table>
  );
}
