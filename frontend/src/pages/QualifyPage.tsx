import { useEffect, useState } from 'react';

import {
  useQualificationQueue,
  useQualifyTrack,
  useResetQualifications,
} from '../hooks/useQualification';
import { formatArtists, formatDuration, pluralize } from '../services/format';
import { useCreatePlaylist } from '../hooks/usePlaylists';
import { PlaylistPicker } from '../components/qualify/PlaylistPicker';
import { PlaylistFormModal } from '../components/playlist/PlaylistFormModal';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LoadingBlock } from '../components/ui/Spinner';
import { ErrorState, InlineError } from '../components/ui/ErrorState';
import type { PlaylistTrackDto } from '../types/api';

/**
 * Tri des titres likés, un morceau à la fois.
 *
 * Spotify n'offre aucun moyen de ranger ses likés dans des playlists autrement
 * qu'un par un, manuellement. Cette page en fait un parcours continu : un titre
 * s'affiche, on coche ses destinations, on valide, le suivant apparaît.
 *
 * L'opération est **non destructive** : le titre est ajouté aux playlists
 * choisies et reste dans les likés, qui demeurent la collection de référence.
 */
export function QualifyPage() {
  const queue = useQualificationQueue();
  const qualify = useQualifyTrack();
  const reset = useResetQualifications();

  const createPlaylist = useCreatePlaylist();

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [isResetOpen, setResetOpen] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);

  const currentTrack = queue.data?.tracks[0];

  // La sélection est propre à chaque titre : la conserver d'un morceau à
  // l'autre rangerait des titres dans des playlists non voulues.
  //
  // Elle démarre sur les playlists contenant déjà le titre : l'utilisateur voit
  // immédiatement où il est rangé, et peut compléter sans rien défaire. Les
  // playlists déjà cochées ne provoquent aucun réajout (garde côté serveur).
  // Dépendance sur l'URI seul, volontairement : `inPlaylistIds` est un nouveau
  // tableau à chaque rendu, et l'inclure réinitialiserait la sélection en
  // boucle, effaçant les cases que l'utilisateur vient de cocher.
  const initialPlaylistIds = currentTrack?.inPlaylistIds.join(',') ?? '';

  useEffect(() => {
    setSelectedIds(new Set(initialPlaylistIds === '' ? [] : initialPlaylistIds.split(',')));
  }, [initialPlaylistIds]);

  if (queue.isLoading) {
    return <LoadingBlock label="Chargement de vos titres likés…" />;
  }

  if (queue.isError) {
    return (
      <div className="p-6">
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      </div>
    );
  }

  const data = queue.data;

  if (data === undefined) {
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

  const handleQualify = (playlistIds: string[]): void => {
    if (currentTrack === undefined) {
      return;
    }

    qualify.mutate({ uri: currentTrack.uri, playlistIds });
  };

  const alreadyInIds = new Set(currentTrack?.inPlaylistIds ?? []);

  // Seules les playlists nouvellement cochées donneront lieu à un ajout : le
  // compteur du bouton doit refléter cela, pas le nombre de cases cochées.
  const newAdditionCount = [...selectedIds].filter((id) => !alreadyInIds.has(id)).length;

  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-2">
      <QualifyHeader
        qualifiedCount={data.qualifiedCount}
        totalLiked={data.totalLiked}
        remainingCount={data.remainingCount}
        onOpenReset={() => setResetOpen(true)}
      />

      {qualify.isError && <InlineError error={qualify.error} />}

      {currentTrack === undefined ? (
        <AllDoneState
          totalLiked={data.totalLiked}
          onOpenReset={() => setResetOpen(true)}
        />
      ) : (
        <>
          <TrackCard track={currentTrack} />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-content-secondary">
                Ranger dans…
              </h3>

              {/*
                Créer une playlist sans quitter le tri : c'est en triant qu'on
                réalise qu'une catégorie manque.
              */}
              <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
                <span aria-hidden="true">+</span> Nouvelle playlist
              </Button>
            </div>

            <PlaylistPicker
              playlists={data.playlists}
              selectedIds={selectedIds}
              alreadyInIds={alreadyInIds}
              onToggle={handleToggle}
              disabled={qualify.isPending}
            />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => handleQualify([...selectedIds])}
              disabled={newAdditionCount === 0 || qualify.isPending}
            >
              {qualify.isPending
                ? 'Ajout…'
                : `Ajouter à ${newAdditionCount} ${pluralize(
                    newAdditionCount,
                    'playlist',
                    'playlists',
                  )}`}
            </Button>

            {/*
              « Passer » est une décision à part entière : le titre est marqué
              traité et ne reviendra plus, sans rien modifier côté Spotify.
            */}
            <Button
              variant="secondary"
              onClick={() => handleQualify([])}
              disabled={qualify.isPending}
            >
              Passer ce titre
            </Button>

            <span className="text-xs text-content-muted">
              {alreadyInIds.size > 0
                ? `Déjà dans ${alreadyInIds.size} ${pluralize(
                    alreadyInIds.size,
                    'playlist',
                    'playlists',
                  )} · aucun doublon ne sera créé.`
                : 'Le titre reste dans vos Titres likés dans tous les cas.'}
            </span>
          </div>
        </>
      )}

      <PlaylistFormModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => {
          createPlaylist.mutate(
            {
              name: values.name,
              ...(values.description === '' ? {} : { description: values.description }),
            },
            {
              onSuccess: (created) => {
                setCreateOpen(false);
                // La playlist vient d'être créée pour ce titre : on la coche
                // d'emblée, c'est la raison même de sa création.
                setSelectedIds((current) => new Set(current).add(created.id));
              },
            },
          );
        }}
        isPending={createPlaylist.isPending}
        error={createPlaylist.error}
        title="Nouvelle playlist"
        description="Elle sera créée vide, puis cochée pour ce titre."
        submitLabel="Créer"
      />

      <ResetModal
        isOpen={isResetOpen}
        onClose={() => setResetOpen(false)}
        qualifiedCount={data.qualifiedCount}
        onConfirm={() => {
          reset.mutate(undefined, { onSuccess: () => setResetOpen(false) });
        }}
        isPending={reset.isPending}
        error={reset.error}
      />
    </div>
  );
}

interface QualifyHeaderProps {
  qualifiedCount: number;
  totalLiked: number;
  remainingCount: number;
  onOpenReset: () => void;
}

function QualifyHeader({
  qualifiedCount,
  totalLiked,
  remainingCount,
  onOpenReset,
}: QualifyHeaderProps) {
  const progress = totalLiked === 0 ? 0 : Math.round((qualifiedCount / totalLiked) * 100);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
            Titres likés
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight">Qualifier</h2>
        </div>

        <Button variant="ghost" size="sm" onClick={onOpenReset}>
          Réinitialiser la progression
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuenow={qualifiedCount}
          aria-valuemin={0}
          aria-valuemax={totalLiked}
          aria-label="Progression du tri"
          className="h-1.5 overflow-hidden rounded-pill bg-surface-active"
        >
          <div
            className="h-full rounded-pill bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-content-secondary">
          {qualifiedCount} / {totalLiked} traités ·{' '}
          <strong className="text-content-primary">{remainingCount}</strong>{' '}
          {pluralize(remainingCount, 'restant', 'restants')}
        </p>
      </div>
    </header>
  );
}

/** Carte du titre en cours, avec sa pochette en grand format. */
function TrackCard({ track }: { track: PlaylistTrackDto }) {
  return (
    <section className="flex items-center gap-5 rounded-card bg-gradient-to-br from-surface-active to-surface-raised p-5">
      {track.albumImageUrl === null ? (
        <span
          aria-hidden="true"
          className="flex h-28 w-28 shrink-0 items-center justify-center rounded-card bg-surface-overlay text-4xl text-content-muted"
        >
          ♪
        </span>
      ) : (
        <img
          src={track.albumImageUrl}
          alt=""
          className="h-28 w-28 shrink-0 rounded-card object-cover shadow-xl"
        />
      )}

      <div className="min-w-0">
        <h3 className="truncate-line text-2xl font-bold text-content-primary">
          {track.name}
        </h3>
        <p className="mt-1 truncate-line text-sm text-content-secondary">
          {formatArtists(track.artists)}
        </p>
        <p className="mt-2 truncate-line text-xs text-content-muted">
          {track.albumName} · {formatDuration(track.durationMs)}
        </p>
      </div>
    </section>
  );
}

function AllDoneState({
  totalLiked,
  onOpenReset,
}: {
  totalLiked: number;
  onOpenReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-surface-raised py-16 text-center">
      <span aria-hidden="true" className="text-5xl">
        🎉
      </span>
      <div>
        <p className="text-lg font-bold text-content-primary">
          Tous vos titres likés sont triés
        </p>
        <p className="mt-1 max-w-md text-sm text-content-secondary">
          Les {totalLiked} titres ont été traités. Après avoir créé de nouvelles
          playlists, réinitialisez la progression pour les repasser en revue.
        </p>
      </div>

      <Button variant="secondary" onClick={onOpenReset}>
        Réinitialiser la progression
      </Button>
    </div>
  );
}

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  qualifiedCount: number;
  onConfirm: () => void;
  isPending: boolean;
  error: unknown;
}

function ResetModal({
  isOpen,
  onClose,
  qualifiedCount,
  onConfirm,
  isPending,
  error,
}: ResetModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Réinitialiser la progression"
      description="Tous vos titres likés vous seront à nouveau proposés."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Réinitialisation…' : 'Réinitialiser'}
          </Button>
        </>
      }
    >
      {error !== null && error !== undefined && (
        <div className="mb-4">
          <InlineError error={error} />
        </div>
      )}

      <div className="flex flex-col gap-3 text-sm text-content-secondary">
        <p>
          La mémoire des <strong className="text-content-primary">{qualifiedCount}</strong>{' '}
          {pluralize(qualifiedCount, 'titre déjà traité', 'titres déjà traités')} sera
          effacée.
        </p>

        {/*
          Le point qui inquiète le plus : rien n'est supprimé côté Spotify.
          On le dit explicitement pour lever le doute avant validation.
        */}
        <p className="rounded-md bg-surface-raised px-3 py-2">
          <strong className="text-content-primary">Aucune donnée Spotify n'est
          touchée</strong> : vos playlists et vos titres likés restent
          exactement en l'état. Seule la mémoire d'Overtify est remise à zéro.
        </p>
      </div>
    </Modal>
  );
}
