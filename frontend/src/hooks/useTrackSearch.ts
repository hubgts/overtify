import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { searchApi } from '../api/endpoints';
import { queryKeys } from './queryKeys';
import { useDebouncedValue } from './useDebouncedValue';
import type { SearchResultDto } from '../types/api';

/** Délai avant déclenchement de la recherche, pour ménager le quota Spotify. */
const SEARCH_DEBOUNCE_MS = 300;

/** Sous ce seuil, une recherche renverrait surtout du bruit. */
const MIN_QUERY_LENGTH = 2;

/**
 * Recherche de morceaux dans le catalogue Spotify.
 *
 * La saisie est débouncée puis mise en cache par terme : revenir sur une
 * recherche déjà effectuée n'entraîne aucun appel réseau.
 */
export function useTrackSearch(rawQuery: string): UseQueryResult<SearchResultDto> {
  const query = useDebouncedValue(rawQuery.trim(), SEARCH_DEBOUNCE_MS);

  return useQuery({
    queryKey: queryKeys.trackSearch(query),
    queryFn: ({ signal }) => searchApi.searchTracks(query, signal),
    enabled: query.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60 * 1000,
  });
}
