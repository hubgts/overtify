import { useState } from 'react';

import { useTrackSearch } from '../../hooks/useTrackSearch';
import { formatArtists, formatDuration } from '../../services/format';
import { AlbumCover } from '../ui/AlbumCover';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { InlineError } from '../ui/ErrorState';
import type { TrackDto } from '../../types/api';

interface AddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (uri: string) => void;
  /** URI en cours d'ajout, pour l'indicateur de chargement de la ligne. */
  pendingUri: string | null;
  /** URI déjà présents dans la playlist, pour signaler les ajouts en double. */
  existingUris: ReadonlySet<string>;
  error: unknown;
}

/**
 * Recherche dans le catalogue Spotify et ajout à la playlist courante.
 *
 * La modale reste ouverte après un ajout : ajouter plusieurs morceaux à la
 * suite est le cas d'usage courant.
 */
export function AddTrackModal({
  isOpen,
  onClose,
  onAddTrack,
  pendingUri,
  existingUris,
  error,
}: AddTrackModalProps) {
  const [query, setQuery] = useState('');
  const search = useTrackSearch(query);

  const handleClose = (): void => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ajouter un morceau"
      description="Recherchez dans le catalogue Spotify, puis ajoutez à la playlist."
      size="lg"
      footer={
        <Button variant="secondary" onClick={handleClose}>
          Fermer
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="sr-only" htmlFor="track-search">
          Rechercher un morceau
        </label>
        <input
          id="track-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titre, artiste, album…"
          autoComplete="off"
          className="w-full rounded-pill bg-surface-hover px-5 py-3 text-sm text-content-primary placeholder:text-content-muted"
        />

        {error !== null && error !== undefined && <InlineError error={error} />}

        <SearchResults
          query={query}
          isLoading={search.isFetching}
          searchError={search.error}
          tracks={search.data?.tracks}
          onAddTrack={onAddTrack}
          pendingUri={pendingUri}
          existingUris={existingUris}
        />
      </div>
    </Modal>
  );
}

interface SearchResultsProps {
  query: string;
  isLoading: boolean;
  searchError: unknown;
  tracks: TrackDto[] | undefined;
  onAddTrack: (uri: string) => void;
  pendingUri: string | null;
  existingUris: ReadonlySet<string>;
}

function SearchResults({
  query,
  isLoading,
  searchError,
  tracks,
  onAddTrack,
  pendingUri,
  existingUris,
}: SearchResultsProps) {
  if (query.trim().length < 2) {
    return (
      <p className="py-8 text-center text-sm text-content-secondary">
        Saisissez au moins deux caractères pour lancer la recherche.
      </p>
    );
  }

  if (searchError !== null) {
    return <InlineError error={searchError} />;
  }

  if (isLoading) {
    return (
      <div className="py-8">
        <Spinner label="Recherche en cours…" />
      </div>
    );
  }

  if (tracks === undefined || tracks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-content-secondary">
        Aucun résultat pour « {query} ».
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {tracks.map((track) => (
        <li key={track.uri}>
          <SearchResultRow
            track={track}
            onAdd={() => onAddTrack(track.uri)}
            isPending={pendingUri === track.uri}
            isAlreadyPresent={existingUris.has(track.uri)}
          />
        </li>
      ))}
    </ul>
  );
}

interface SearchResultRowProps {
  track: TrackDto;
  onAdd: () => void;
  isPending: boolean;
  isAlreadyPresent: boolean;
}

function SearchResultRow({ track, onAdd, isPending, isAlreadyPresent }: SearchResultRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-surface-hover">
      <AlbumCover imageUrl={track.albumImageUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate-line text-sm font-medium">{track.name}</p>
        <p className="truncate-line text-xs text-content-secondary">
          {formatArtists(track.artists)} · {track.albumName}
        </p>
      </div>

      <span className="text-xs tabular-nums text-content-secondary">
        {formatDuration(track.durationMs)}
      </span>

      <Button
        size="sm"
        variant={isAlreadyPresent ? 'secondary' : 'primary'}
        onClick={onAdd}
        disabled={isPending}
        // L'ajout reste possible : Spotify autorise les doublons volontaires.
        title={isAlreadyPresent ? 'Déjà présent dans la playlist' : undefined}
      >
        {isPending ? 'Ajout…' : isAlreadyPresent ? 'Déjà présent' : 'Ajouter'}
      </Button>
    </div>
  );
}
