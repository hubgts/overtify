/**
 * Formatage d'affichage. Fonctions pures, sans dépendance à React.
 */

/** Formate une durée en `m:ss`, comme dans l'app Spotify. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Joint les artistes comme Spotify : « A, B, C ». */
export function formatArtists(artists: readonly string[]): string {
  return artists.join(', ');
}

/** Accorde un nom commun en fonction du nombre. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
}

/** « 3 morceaux », « 1 morceau ». */
export function formatTrackCount(count: number): string {
  return `${count} ${pluralize(count, 'morceau', 'morceaux')}`;
}
