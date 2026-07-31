/**
 * Sous-ensemble typé des réponses de l'API Spotify.
 *
 * On ne déclare que les champs réellement consommés par Overtify : inutile de
 * recopier tout le modèle Spotify, et ça documente notre surface de dépendance.
 */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

/**
 * Morceau Spotify.
 *
 * Comme pour les playlists, plusieurs champs sont optionnels en pratique :
 * les titres locaux et les contenus indisponibles arrivent incomplets.
 */
export interface SpotifyTrack {
  id?: string | null;
  uri: string;
  name?: string;
  duration_ms?: number;
  artists?: SpotifyArtist[] | null;
  album?: SpotifyAlbum | null;
  /** Vrai pour les titres locaux, non gérables via l'API. */
  is_local?: boolean;
}

/**
 * Entrée d'une playlist.
 *
 * L'endpoint `/playlists/{id}/items` imbrique la piste sous `item` ; `track`
 * n'existe plus que pour compatibilité et est marqué déprécié. Les deux sont
 * déclarés ici, et lus dans cet ordre par `extractTrack()`.
 *
 * https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
 */
export interface SpotifyPlaylistTrackItem {
  added_at?: string | null;
  /** Champ courant. Null pour un titre indisponible dans la région. */
  item?: SpotifyTrack | null;
  /** @deprecated Conservé pour les réponses de l'ancien format. */
  track?: SpotifyTrack | null;
}

export interface SpotifyPlaylistOwner {
  id: string;
  display_name: string | null;
}

/**
 * Playlist telle que renvoyée par Spotify.
 *
 * Plusieurs champs sont déclarés optionnels alors que la documentation les
 * présente comme garantis : `/me/playlists` renvoie en pratique des entrées
 * incomplètes (playlists en cours de suppression, contenus indisponibles dans
 * la région). Les traiter comme obligatoires provoquait un crash au mapping.
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[] | null;
  owner?: SpotifyPlaylistOwner;
  public?: boolean | null;
  collaborative?: boolean;
  snapshot_id: string;
  /**
   * Nombre de morceaux.
   *
   * Spotify expose ce compteur sous deux noms selon l'endpoint : `tracks` dans
   * la documentation, mais `items` dans la réponse réelle de `/me/playlists`.
   * Les deux sont déclarés ici et lus avec un repli (cf. toPlaylistSummaryDto).
   */
  tracks?: { total: number } | null;
  /** Tantôt un objet paginé, tantôt le tableau lui-même selon l'endpoint. */
  items?: { total?: number } | unknown[] | null;
}

export interface SpotifyPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface SpotifySearchResponse {
  tracks: SpotifyPage<SpotifyTrack>;
}

export interface SpotifySnapshotResponse {
  snapshot_id: string;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}
