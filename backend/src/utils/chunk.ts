/**
 * Découpe un tableau en lots.
 *
 * Utilisé pour respecter les limites de taille imposées par l'API Spotify,
 * qui diffèrent selon l'endpoint (100 pour les playlists, 50 pour les likés).
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
