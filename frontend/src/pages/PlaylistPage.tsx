import { useMemo, useState } from 'react';

import { useAddTracks, usePlaylistDetail, useRemoveTracks } from '../hooks/usePlaylists';
import { useDuplicateReport } from '../hooks/useDuplicateReport';
import { countRemovableTracks } from '../services/duplicates/detectDuplicates';
import { PlaylistHeader } from '../components/playlist/PlaylistHeader';
import { TrackTable } from '../components/playlist/TrackTable';
import { AddTrackModal } from '../components/playlist/AddTrackModal';
import { DedupeModal } from '../components/dedupe/DedupeModal';
import { LoadingBlock } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import type { PlaylistTrackDto, TrackRemovalDto } from '../types/api';

interface PlaylistPageProps {
  playlistId: string;
}

/**
 * Vue d'une playlist : liste des morceaux, ajout, suppression, dédoublonnage.
 *
 * Cette page orchestre les hooks de données et les modales ; l'affichage est
 * délégué à des composants sans logique métier, et la détection de doublons à
 * un service pur.
 */
export function PlaylistPage({ playlistId }: PlaylistPageProps) {
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isDedupeModalOpen, setDedupeModalOpen] = useState(false);
  const [removingPosition, setRemovingPosition] = useState<number | null>(null);

  const playlistQuery = usePlaylistDetail(playlistId);
  const addTracks = useAddTracks(playlistId);
  const removeTracks = useRemoveTracks(playlistId);

  const duplicateReport = useDuplicateReport(playlistQuery.data?.tracks);
  const removableCount = useMemo(
    () => countRemovableTracks(duplicateReport),
    [duplicateReport],
  );

  const existingUris = useMemo(
    () => new Set(playlistQuery.data?.tracks.map((track) => track.uri) ?? []),
    [playlistQuery.data],
  );

  if (playlistQuery.isLoading) {
    return <LoadingBlock label="Chargement de la playlist…" />;
  }

  if (playlistQuery.isError) {
    return (
      <div className="p-6">
        <ErrorState error={playlistQuery.error} onRetry={() => void playlistQuery.refetch()} />
      </div>
    );
  }

  const playlist = playlistQuery.data;

  if (playlist === undefined) {
    return null;
  }

  const handleRemoveSingleTrack = (track: PlaylistTrackDto): void => {
    setRemovingPosition(track.position);

    removeTracks.mutate(
      {
        tracks: [{ uri: track.uri, position: track.position }],
        snapshotId: playlist.snapshotId,
      },
      { onSettled: () => setRemovingPosition(null) },
    );
  };

  const handleConfirmDedupe = (removals: TrackRemovalDto[]): void => {
    removeTracks.mutate(
      { tracks: removals, snapshotId: playlist.snapshotId },
      { onSuccess: () => setDedupeModalOpen(false) },
    );
  };

  return (
    <>
      <PlaylistHeader
        playlist={playlist}
        duplicateCount={removableCount}
        onOpenAddTrack={() => setAddModalOpen(true)}
        onOpenDedupe={() => setDedupeModalOpen(true)}
      />

      <div className="px-6 pb-12">
        {removeTracks.isError && !isDedupeModalOpen && (
          <div className="mb-4">
            <ErrorState error={removeTracks.error} />
          </div>
        )}

        <TrackTable
          tracks={playlist.tracks}
          onRemoveTrack={handleRemoveSingleTrack}
          removingPosition={removingPosition}
        />
      </div>

      <AddTrackModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddTrack={(uri) => addTracks.mutate([uri])}
        pendingUri={addTracks.isPending ? (addTracks.variables?.[0] ?? null) : null}
        existingUris={existingUris}
        error={addTracks.error}
      />

      <DedupeModal
        isOpen={isDedupeModalOpen}
        onClose={() => setDedupeModalOpen(false)}
        report={duplicateReport}
        onConfirm={handleConfirmDedupe}
        isSubmitting={removeTracks.isPending}
        error={isDedupeModalOpen ? removeTracks.error : null}
      />
    </>
  );
}
