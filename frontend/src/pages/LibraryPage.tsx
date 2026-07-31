import { useMemo, useState } from 'react';

import { useLibrary, useRefreshLibrary } from '../hooks/useLibrary';
import {
  computeLibraryStats,
  filterLibrary,
  isLiked,
  playlistLocations,
  type LibraryFilter,
  type LibrarySort,
} from '../services/library/filterLibrary';
import { formatArtists, formatDuration, pluralize } from '../services/format';
import { ManageMembershipModal } from '../components/library/ManageMembershipModal';
import { AlbumCover } from '../components/ui/AlbumCover';
import { Button } from '../components/ui/Button';
import { LoadingBlock } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import type { LibraryEntryDto } from '../types/api';

/**
 * Vue « où est ce morceau ? ».
 *
 * Spotify cloisonne playlists et titres likés : impossible d'y savoir dans
 * quelles playlists figure un morceau, ni lesquels ne sont rangés nulle part.
 * Cette page répond aux deux questions.
 *
 * **Une ligne par enregistrement.** Deux éditions d'un même titre restent
 * distinctes : la vue est factuelle, le rapprochement des éditions relève du
 * dédoublonnage, qui repose sur une heuristique.
 */
export function LibraryPage() {
  const library = useLibrary();
  const refresh = useRefreshLibrary();

  /** Morceau dont la modale de gestion est ouverte. */
  const [entryToManage, setEntryToManage] = useState<LibraryEntryDto | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('locations');
  const [search, setSearch] = useState('');

  const entries = library.data?.entries;

  const stats = useMemo(() => computeLibraryStats(entries ?? []), [entries]);

  const visible = useMemo(
    () => filterLibrary(entries ?? [], { filter, sort, search }),
    [entries, filter, sort, search],
  );

  /** Nom de playlist par identifiant, pour les pastilles. */
  const playlistNames = useMemo(() => {
    const map = new Map<string, string>();

    for (const playlist of library.data?.playlists ?? []) {
      map.set(playlist.id, playlist.name);
    }

    return map;
  }, [library.data]);

  if (library.isLoading) {
    return <LoadingBlock label="Indexation de votre bibliothèque…" />;
  }

  if (library.isError) {
    return (
      <div className="p-6">
        <ErrorState error={library.error} onRetry={() => void library.refetch()} />
      </div>
    );
  }

  if (library.data === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5 px-6 pb-12 pt-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
            Bibliothèque
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight">Où est ce morceau ?</h2>
          <p className="mt-1 text-sm text-content-secondary">
            {stats.total} {pluralize(stats.total, 'morceau distinct', 'morceaux distincts')} dans{' '}
            {library.data.playlists.length}{' '}
            {pluralize(library.data.playlists.length, 'playlist', 'playlists')} et vos titres likés.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? 'Actualisation…' : 'Actualiser'}
        </Button>
      </header>

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        stats={stats}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
      />

      {visible.length === 0 ? (
        <p className="rounded-card bg-surface-raised px-4 py-10 text-center text-sm text-content-secondary">
          Aucun morceau ne correspond à ce filtre.
        </p>
      ) : (
        <LibraryTable
          entries={visible}
          playlistNames={playlistNames}
          onSelectEntry={setEntryToManage}
        />
      )}

      <ManageMembershipModal
        entry={entryToManage}
        playlists={library.data.playlists}
        onClose={() => setEntryToManage(null)}
      />
    </div>
  );
}

interface FilterBarProps {
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  stats: ReturnType<typeof computeLibraryStats>;
  search: string;
  onSearchChange: (search: string) => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
}

function FilterBar({
  filter,
  onFilterChange,
  stats,
  search,
  onSearchChange,
  sort,
  onSortChange,
}: FilterBarProps) {
  /** Les libellés disent ce que le filtre isole, pas seulement son nom. */
  const filters: ReadonlyArray<{ value: LibraryFilter; label: string; count: number }> = [
    { value: 'all', label: 'Tous', count: stats.total },
    { value: 'multiple', label: 'Dans plusieurs playlists', count: stats.inMultiplePlaylists },
    { value: 'orphans', label: 'Likés non rangés', count: stats.orphans },
    { value: 'unliked', label: 'En playlist, non likés', count: stats.unliked },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onFilterChange(option.value)}
            aria-pressed={filter === option.value}
            className={`rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === option.value
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-raised text-content-secondary hover:bg-surface-hover hover:text-content-primary'
            }`}
          >
            {option.label}
            <span className="ml-1.5 opacity-70">{option.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="library-search">
          Rechercher dans la bibliothèque
        </label>
        <input
          id="library-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Titre, artiste, album…"
          className="min-w-0 flex-1 rounded-pill bg-surface-hover px-4 py-2 text-sm text-content-primary placeholder:text-content-muted"
        />

        <label className="flex items-center gap-2 text-xs text-content-secondary">
          Trier par
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as LibrarySort)}
            className="cursor-pointer rounded-md bg-surface-hover px-2 py-1.5 text-xs text-content-primary"
          >
            <option value="locations">Nombre de playlists</option>
            <option value="name">Titre</option>
            <option value="artist">Artiste</option>
          </select>
        </label>
      </div>
    </div>
  );
}

interface LibraryTableProps {
  entries: LibraryEntryDto[];
  playlistNames: Map<string, string>;
  onSelectEntry: (entry: LibraryEntryDto) => void;
}

function LibraryTable({ entries, playlistNames, onSelectEntry }: LibraryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-surface-raised/95 backdrop-blur">
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-content-secondary">
            <th scope="col" className="px-2 py-2 font-normal">
              Titre
            </th>
            <th scope="col" className="px-2 py-2 font-normal">
              Présent dans
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-right font-normal">
              Durée
            </th>
            <th scope="col" className="w-28 px-2 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => (
            <LibraryRow
              key={entry.uri}
              entry={entry}
              playlistNames={playlistNames}
              onSelect={() => onSelectEntry(entry)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LibraryRow({
  entry,
  playlistNames,
  onSelect,
}: {
  entry: LibraryEntryDto;
  playlistNames: Map<string, string>;
  onSelect: () => void;
}) {
  const inPlaylists = playlistLocations(entry);
  const liked = isLiked(entry);

  return (
    <tr className="group border-b border-white/5 transition-colors hover:bg-surface-hover">
      <td className="px-2 py-2">
        <div className="flex items-center gap-3">
          <AlbumCover imageUrl={entry.albumImageUrl} />

          <div className="min-w-0">
            <p className="truncate-line text-sm font-medium text-content-primary">{entry.name}</p>
            <p className="truncate-line text-xs text-content-secondary">
              {formatArtists(entry.artists)}
            </p>
          </div>
        </div>
      </td>

      <td className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {liked && (
            <span className="rounded-pill bg-accent/20 px-2 py-0.5 text-[11px] text-accent">
              ♥ Likés
            </span>
          )}

          {inPlaylists.map((location) => (
            <span
              key={location.playlistId}
              className="rounded-pill bg-surface-active px-2 py-0.5 text-[11px] text-content-secondary"
            >
              {playlistNames.get(location.playlistId) ?? 'Playlist'}
            </span>
          ))}

          {/* Un liké rangé nulle part : le cas que la vue sert à révéler. */}
          {inPlaylists.length === 0 && liked && (
            <span className="text-[11px] text-content-muted">Aucune playlist</span>
          )}
        </div>
      </td>

      <td className="px-2 py-2 text-right text-sm tabular-nums text-content-secondary">
        {formatDuration(entry.durationMs)}
      </td>

      <td className="px-2 py-2 text-right">
        {/*
          Visible au survol comme dans Spotify, mais toujours présent dans le
          DOM : sinon l'action serait inatteignable au clavier.
        */}
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Gérer les playlists de ${entry.name}`}
          className="rounded-pill bg-surface-active px-3 py-1 text-xs text-content-secondary opacity-0 transition-all hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
        >
          Gérer
        </button>
      </td>
    </tr>
  );
}
