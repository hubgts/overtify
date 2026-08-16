import { useRemovedPlaylists, useRestorePlaylist } from '../../hooks/usePlaylists';
import { formatTrackCount } from '../../services/format';
import { AlbumCover } from '../ui/AlbumCover';
import { Button } from '../ui/Button';

/**
 * Section des playlists retirées, sous la bibliothèque.
 *
 * Affichées grisées plutôt que masquées : le retrait étant réversible, les
 * cacher donnerait l'impression d'une suppression définitive.
 *
 * Porte sa propre requête et sa propre mutation : la barre latérale n'a pas à
 * relayer l'état d'un bouton « Restaurer » qui ne la concerne pas.
 */
export function RemovedPlaylists() {
  const removedQuery = useRemovedPlaylists();
  const restorePlaylist = useRestorePlaylist();

  const playlists = removedQuery.data;

  if (playlists === undefined || playlists.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 border-t border-white/5 pt-3">
      <h3 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
        Playlists retirées
      </h3>

      <ul>
        {playlists.map((playlist) => {
          const isRestoring =
            restorePlaylist.isPending && restorePlaylist.variables === playlist.id;

          return (
            <li
              key={playlist.id}
              className="flex items-center gap-3 rounded-md p-2 opacity-60 transition-opacity hover:opacity-100"
            >
              <AlbumCover imageUrl={playlist.imageUrl} />

              <span className="min-w-0 flex-1">
                <span className="block truncate-line text-sm text-content-secondary line-through">
                  {playlist.name}
                </span>
                <span className="block truncate-line text-xs text-content-muted">
                  {formatTrackCount(playlist.trackCount)}
                </span>
              </span>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => restorePlaylist.mutate(playlist.id)}
                disabled={isRestoring}
              >
                {isRestoring ? '…' : 'Restaurer'}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
