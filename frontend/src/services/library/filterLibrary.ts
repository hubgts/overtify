import { toComparableCase } from '../duplicates/normalize';
import { LIKED_SONGS_ID } from '../likedSongs';
import type { LibraryEntryDto } from '../../types/api';

/**
 * Filtrage et tri de la bibliothèque.
 *
 * Fonctions pures, sans dépendance à React ni au réseau : l'index est chargé
 * une fois, tout le reste se fait localement et se teste directement.
 */

export type LibraryFilter =
  /** Tous les morceaux. */
  | 'all'
  /** Présents dans au moins deux playlists — les plus dispersés. */
  | 'multiple'
  /** Likés mais rangés dans aucune playlist. */
  | 'orphans'
  /** Dans une playlist sans être likés. */
  | 'unliked';

export type LibrarySort = 'name' | 'artist' | 'locations';

/** Emplacements hors titres likés. */
export function playlistLocations(entry: LibraryEntryDto) {
  return entry.locations.filter((location) => location.playlistId !== LIKED_SONGS_ID);
}

/**
 * Nombre de playlists contenant le morceau, sans allouer de tableau.
 *
 * Utilisé sur les chemins chauds (filtrage et tri, réévalués à chaque frappe)
 * où `playlistLocations().length` allouait un tableau intermédiaire par appel.
 */
function countPlaylistLocations(entry: LibraryEntryDto): number {
  return entry.locations.reduce(
    (total, location) => (location.playlistId === LIKED_SONGS_ID ? total : total + 1),
    0,
  );
}

export function isLiked(entry: LibraryEntryDto): boolean {
  return entry.locations.some((location) => location.playlistId === LIKED_SONGS_ID);
}

function matchesFilter(entry: LibraryEntryDto, filter: LibraryFilter): boolean {
  const inPlaylists = countPlaylistLocations(entry);

  switch (filter) {
    case 'multiple':
      return inPlaylists >= 2;
    case 'orphans':
      return isLiked(entry) && inPlaylists === 0;
    case 'unliked':
      return !isLiked(entry) && inPlaylists > 0;
    case 'all':
      return true;
  }
}

/**
 * Recherche insensible à la casse et aux accents, sur titre, artistes et album.
 *
 * `normalizedSearch` est calculé une seule fois par appel de `filterLibrary` :
 * le normaliser par entrée refaisait le même travail des milliers de fois à
 * chaque frappe.
 */
function matchesSearch(entry: LibraryEntryDto, normalizedSearch: string): boolean {
  if (normalizedSearch === '') {
    return true;
  }

  const haystack = toComparableCase(
    `${entry.name} ${entry.artists.join(' ')} ${entry.albumName}`,
  );

  return haystack.includes(normalizedSearch);
}

/**
 * Compare deux entrées déjà décorées de leur nombre d'emplacements.
 *
 * La décoration évite de recompter à chaque comparaison : un tri fait
 * O(n log n) comparaisons, soit des centaines de milliers de recomptages sur
 * une grande bibliothèque.
 */
function compare(
  a: DecoratedEntry,
  b: DecoratedEntry,
  sort: LibrarySort,
): number {
  switch (sort) {
    case 'artist':
      return (a.entry.artists[0] ?? '').localeCompare(b.entry.artists[0] ?? '', 'fr');
    case 'locations':
      // Décroissant : les morceaux les plus dispersés en premier, ce sont
      // ceux sur lesquels l'utilisateur veut agir.
      return b.playlistCount - a.playlistCount;
    case 'name':
      return a.entry.name.localeCompare(b.entry.name, 'fr');
  }
}

interface DecoratedEntry {
  entry: LibraryEntryDto;
  playlistCount: number;
}

export interface LibraryQuery {
  filter: LibraryFilter;
  sort: LibrarySort;
  search: string;
}

export function filterLibrary(
  entries: readonly LibraryEntryDto[],
  query: LibraryQuery,
): LibraryEntryDto[] {
  const normalizedSearch = toComparableCase(query.search);

  return entries
    .filter(
      (entry) =>
        matchesFilter(entry, query.filter) && matchesSearch(entry, normalizedSearch),
    )
    .map((entry) => ({ entry, playlistCount: countPlaylistLocations(entry) }))
    .sort((a, b) => compare(a, b, query.sort))
    .map((decorated) => decorated.entry);
}

export interface LibraryStats {
  total: number;
  inMultiplePlaylists: number;
  orphans: number;
  unliked: number;
}

/** Compteurs affichés sur les filtres, calculés en une seule passe. */
export function computeLibraryStats(entries: readonly LibraryEntryDto[]): LibraryStats {
  const stats: LibraryStats = { total: entries.length, inMultiplePlaylists: 0, orphans: 0, unliked: 0 };

  for (const entry of entries) {
    const inPlaylists = countPlaylistLocations(entry);
    const liked = isLiked(entry);

    if (inPlaylists >= 2) {
      stats.inMultiplePlaylists += 1;
    }

    if (liked && inPlaylists === 0) {
      stats.orphans += 1;
    }

    if (!liked && inPlaylists > 0) {
      stats.unliked += 1;
    }
  }

  return stats;
}
