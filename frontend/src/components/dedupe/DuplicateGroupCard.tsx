import { formatArtists, formatDuration } from '../../services/format';
import { AlbumCover } from '../ui/AlbumCover';
import type { DuplicateGroup } from '../../services/duplicates/detectDuplicates';
import type { RemovalSelection } from '../../services/duplicates/selection';
import type { PlaylistTrackDto } from '../../types/api';

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  selection: RemovalSelection;
  onToggleTrack: (position: number) => void;
  onKeepOnly: (positionToKeep: number) => void;
}

/**
 * Un groupe de doublons, avec le détail de chaque occurrence.
 *
 * L'utilisateur dispose de deux gestes complémentaires :
 *  - cocher/décocher individuellement une occurrence à supprimer ;
 *  - « Garder celui-ci », qui marque toutes les autres d'un seul clic.
 *
 * Les différences entre occurrences (album, durée, position) sont affichées
 * explicitement : ce sont elles qui permettent de trancher entre un remaster
 * et l'original.
 */
export function DuplicateGroupCard({
  group,
  selection,
  onToggleTrack,
  onKeepOnly,
}: DuplicateGroupCardProps) {
  const firstTrack = group.tracks[0];

  if (firstTrack === undefined) {
    return null;
  }

  const selectedCount = group.tracks.filter((track) => selection.has(track.position)).length;
  const isEverythingSelected = selectedCount === group.tracks.length;

  return (
    <li className="rounded-card bg-surface-raised p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="truncate-line text-sm font-bold text-content-primary">
            {firstTrack.name}
          </h4>
          <p className="truncate-line text-xs text-content-secondary">
            {formatArtists(firstTrack.artists)} · {group.tracks.length} occurrences
          </p>
        </div>

        <span
          className={`shrink-0 rounded-pill px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
            group.kind === 'exact'
              ? 'bg-accent/20 text-accent'
              : 'bg-warning/20 text-warning'
          }`}
        >
          {group.kind === 'exact' ? 'Identique' : 'Probable'}
        </span>
      </div>

      {isEverythingSelected && (
        <p role="alert" className="mb-2 rounded-md bg-danger/15 px-3 py-2 text-xs text-danger">
          Toutes les occurrences sont sélectionnées : ce morceau disparaîtra
          complètement de la playlist.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {group.tracks.map((track) => (
          <DuplicateOccurrenceRow
            key={track.position}
            track={track}
            isSelected={selection.has(track.position)}
            onToggle={() => onToggleTrack(track.position)}
            onKeepOnly={() => onKeepOnly(track.position)}
          />
        ))}
      </ul>
    </li>
  );
}

interface DuplicateOccurrenceRowProps {
  track: PlaylistTrackDto;
  isSelected: boolean;
  onToggle: () => void;
  onKeepOnly: () => void;
}

function DuplicateOccurrenceRow({
  track,
  isSelected,
  onToggle,
  onKeepOnly,
}: DuplicateOccurrenceRowProps) {
  const checkboxId = `occurrence-${track.position}`;

  return (
    <li
      className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${
        isSelected ? 'bg-danger/10' : 'bg-surface-overlay/50'
      }`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-[var(--color-danger)]"
      />

      <label htmlFor={checkboxId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <AlbumCover imageUrl={track.albumImageUrl} size="sm" />

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate-line text-xs ${
              isSelected
                ? 'text-content-muted line-through'
                : 'text-content-primary'
            }`}
          >
            {track.name}
          </span>
          <span className="block truncate-line text-[11px] text-content-secondary">
            {track.albumName} · {formatDuration(track.durationMs)} · position{' '}
            {track.position + 1}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={onKeepOnly}
        className="shrink-0 rounded-pill px-2 py-1 text-[11px] text-content-secondary transition-colors hover:bg-surface-active hover:text-accent"
      >
        Garder celui-ci
      </button>
    </li>
  );
}
