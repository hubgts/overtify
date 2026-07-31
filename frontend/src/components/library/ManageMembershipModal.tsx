import { useEffect, useMemo, useState } from 'react';

import { useSyncMembership } from '../../hooks/useLibrary';
import { playlistLocations } from '../../services/library/filterLibrary';
import { isLikedSongs } from '../../services/likedSongs';
import { formatArtists, pluralize } from '../../services/format';
import { PlaylistPicker } from '../qualify/PlaylistPicker';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InlineError } from '../ui/ErrorState';
import type { LibraryEntryDto, PlaylistSummaryDto } from '../../types/api';

interface ManageMembershipModalProps {
  /** Morceau à gérer, ou null quand la modale est fermée. */
  entry: LibraryEntryDto | null;
  playlists: PlaylistSummaryDto[];
  onClose: () => void;
}

/**
 * Gestion de l'appartenance d'un morceau aux playlists.
 *
 * Les cases reflètent l'état **réel** : cocher ajoute, décocher retire. C'est
 * ce qui distingue cette modale d'un simple ajout — et ce qui impose le
 * récapitulatif ci-dessous.
 *
 * **Rien n'est appliqué sans validation.** Un retrait est irréversible côté
 * Spotify ; le récapitulatif énonce donc explicitement ce qui va changer avant
 * que l'utilisateur ne confirme (cf. décision n°5 du journal).
 */
export function ManageMembershipModal({
  entry,
  playlists,
  onClose,
}: ManageMembershipModalProps) {
  const syncMembership = useSyncMembership();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  /** Playlists modifiables : les titres likés se gèrent ailleurs. */
  const destinations = useMemo(
    () => playlists.filter((playlist) => !isLikedSongs(playlist.id)),
    [playlists],
  );

  const initialIds = useMemo(
    () =>
      new Set(
        (entry === null ? [] : playlistLocations(entry)).map(
          (location) => location.playlistId,
        ),
      ),
    [entry],
  );

  // Repart de l'appartenance réelle à chaque ouverture : conserver l'état d'un
  // morceau précédent provoquerait des retraits non voulus.
  const entryUri = entry?.uri;

  useEffect(() => {
    setSelectedIds(new Set(initialIds));
    syncMembership.reset();
    // Seul le morceau compte ; la mutation est recréée à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryUri]);

  const toAdd = useMemo(
    () => [...selectedIds].filter((id) => !initialIds.has(id)),
    [selectedIds, initialIds],
  );

  const toRemove = useMemo(
    () => [...initialIds].filter((id) => !selectedIds.has(id)),
    [selectedIds, initialIds],
  );

  if (entry === null) {
    return null;
  }

  const handleToggle = (playlistId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }

      return next;
    });
  };

  const handleConfirm = (): void => {
    syncMembership.mutate(
      {
        uri: entry.uri,
        playlistIds: [...selectedIds],
        // Périmètre explicite : seules les playlists affichées sont concernées.
        scopePlaylistIds: destinations.map((playlist) => playlist.id),
      },
      { onSuccess: onClose },
    );
  };

  const hasChanges = toAdd.length > 0 || toRemove.length > 0;
  const playlistName = (id: string): string =>
    destinations.find((playlist) => playlist.id === id)?.name ?? 'Playlist';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Gérer les playlists"
      description={`${entry.name} — ${formatArtists(entry.artists)}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={syncMembership.isPending}>
            Annuler
          </Button>

          <Button
            variant={toRemove.length > 0 ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={!hasChanges || syncMembership.isPending}
          >
            {syncMembership.isPending ? 'Application…' : 'Appliquer'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {syncMembership.isError && <InlineError error={syncMembership.error} />}

        <PlaylistPicker
          playlists={destinations}
          selectedIds={selectedIds}
          alreadyInIds={initialIds}
          onToggle={handleToggle}
          disabled={syncMembership.isPending}
        />

        <ChangeSummary
          toAdd={toAdd}
          toRemove={toRemove}
          playlistName={playlistName}
        />
      </div>
    </Modal>
  );
}

interface ChangeSummaryProps {
  toAdd: string[];
  toRemove: string[];
  playlistName: (id: string) => string;
}

/**
 * Récapitulatif des changements avant validation.
 *
 * Les retraits sont mis en avant : ce sont eux qui sont irréversibles, et un
 * décochage involontaire doit sauter aux yeux avant confirmation.
 */
function ChangeSummary({ toAdd, toRemove, playlistName }: ChangeSummaryProps) {
  if (toAdd.length === 0 && toRemove.length === 0) {
    return (
      <p className="rounded-card bg-surface-raised px-4 py-3 text-center text-sm text-content-secondary">
        Cochez ou décochez des playlists pour modifier l'appartenance de ce
        morceau.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface-raised p-4">
      <h4 className="text-sm font-semibold text-content-primary">
        Ce qui va changer
      </h4>

      {toAdd.length > 0 && (
        <p className="text-sm text-content-secondary">
          <span className="font-semibold text-success">
            + Ajouté à {toAdd.length}{' '}
            {pluralize(toAdd.length, 'playlist', 'playlists')}
          </span>{' '}
          : {toAdd.map(playlistName).join(', ')}
        </p>
      )}

      {toRemove.length > 0 && (
        <p role="alert" className="rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
          <strong>
            − Retiré de {toRemove.length}{' '}
            {pluralize(toRemove.length, 'playlist', 'playlists')}
          </strong>{' '}
          : {toRemove.map(playlistName).join(', ')}
          <span className="mt-1 block text-xs opacity-90">
            Ce retrait est définitif côté Spotify.
          </span>
        </p>
      )}
    </div>
  );
}
