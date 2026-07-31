/**
 * Constantes du fournisseur Spotify (endpoints et scopes).
 */

export const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

/**
 * Scopes demandés à l'utilisateur.
 *
 * Principe du moindre privilège : chaque scope allonge l'écran de consentement
 * Spotify et élargit ce qu'Overtify pourrait faire. On ne demande donc que ce
 * qui est réellement utilisé par le code.
 *
 * - playlist-read-private   : lister les playlists privées
 * - playlist-modify-public  : modifier les playlists publiques possédées
 * - playlist-modify-private : modifier les playlists privées possédées
 * - user-library-read       : lire les titres likés
 * - user-library-modify     : ajouter et retirer des titres likés
 *
 * Volontairement absents :
 *
 * - `user-read-email` — Overtify n'utilise jamais l'adresse e-mail. Ce scope
 *   ne servait qu'à afficher « Votre adresse e-mail » sur l'écran de
 *   consentement, sans contrepartie.
 * - `user-read-private` — ne débloque que `country`, `product`, `followers` et
 *   `explicit_content`, dont aucun n'est consommé. Le profil affiché (nom,
 *   avatar) provient des champs publics de `/me`.
 * - lecture audio, historique d'écoute, recommandations — hors périmètre, et
 *   les endpoints correspondants sont de toute façon fermés aux applications
 *   récentes.
 */
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
] as const;

export const SPOTIFY_SCOPE_STRING = SPOTIFY_SCOPES.join(' ');

/**
 * Chemin des morceaux d'une playlist.
 *
 * Spotify a remplacé `/playlists/{id}/tracks` par `/playlists/{id}/items` le
 * 11 février 2026 ; l'ancien chemin renvoie désormais 403 Forbidden. Le chemin
 * est centralisé ici pour qu'une future migration ne demande qu'une seule
 * modification.
 *
 * https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
 */
export function playlistItemsPath(playlistId: string): string {
  return `/playlists/${playlistId}/items`;
}

/**
 * Identifiant interne des « Titres likés ».
 *
 * Cette collection n'est pas une playlist chez Spotify : elle a ses propres
 * endpoints (`/me/tracks`), aucun propriétaire et aucun `snapshot_id`.
 * Overtify lui attribue un identifiant réservé pour la présenter comme une
 * playlist dans l'interface, sans se confondre avec un identifiant Spotify —
 * ceux-ci font 22 caractères base62, celui-ci contient un tiret.
 */
export const LIKED_SONGS_ID = 'liked-songs';

/** Taille de lot maximale imposée par l'API Spotify pour ajout/suppression. */
export const SPOTIFY_MAX_TRACKS_PER_REQUEST = 100;

/** Taille de lot pour `/me/tracks`, plus restrictive que pour les playlists. */
export const SPOTIFY_MAX_LIKED_TRACKS_PER_REQUEST = 50;

/** Taille de page maximale pour la lecture des morceaux d'une playlist. */
export const SPOTIFY_MAX_PAGE_LIMIT = 50;
