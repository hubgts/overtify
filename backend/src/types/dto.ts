/**
 * Contrat d'API entre le backend Overtify et le frontend.
 *
 * Ces types sont volontairement distincts des types Spotify : le front ne
 * dépend que de cette forme stable, ce qui nous laisse libres d'absorber une
 * évolution de l'API Spotify sans toucher à l'UI.
 *
 * Ce fichier est dupliqué à l'identique dans frontend/src/types/api.ts.
 * Toute modification doit être reportée des deux côtés (cf. docs/ARCHITECTURE.md).
 */

export interface UserDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PlaylistSummaryDto {
  /** `liked-songs` pour la collection des titres likés (cf. isLikedSongs). */
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  trackCount: number;
  isPublic: boolean | null;
  collaborative: boolean;
  ownerName: string;
}

export interface TrackDto {
  /** Identifiant Spotify du titre. Null pour un fichier local. */
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  albumName: string;
  albumImageUrl: string | null;
  durationMs: number;
  isLocal: boolean;
}

/**
 * Un titre tel qu'il figure dans une playlist.
 *
 * `position` est l'index 0-based dans la playlist : c'est la clé qui permet de
 * supprimer une occurrence précise sans toucher à ses jumelles.
 */
export interface PlaylistTrackDto extends TrackDto {
  position: number;
  addedAt: string | null;
}

export interface PlaylistDetailDto {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ownerName: string;
  snapshotId: string;
  tracks: PlaylistTrackDto[];
}

export interface SearchResultDto {
  tracks: TrackDto[];
}

/** Position d'une occurrence à retirer, avec son URI pour contrôle côté Spotify. */
export interface TrackRemovalDto {
  uri: string;
  position: number;
}

export interface SnapshotDto {
  snapshotId: string;
}



/** Résultat d'une synchronisation d'appartenance. */
export interface MembershipSyncResultDto {
  uri: string;
  /** Playlists où le morceau a été ajouté. */
  addedTo: string[];
  /** Playlists d'où il a été retiré. */
  removedFrom: string[];
  /** Playlists déjà dans l'état voulu : aucune modification. */
  skipped: string[];
}

/** Un emplacement où se trouve un morceau. */
export interface TrackLocationDto {
  /** Identifiant de playlist, ou `liked-songs` pour les titres likés. */
  playlistId: string;
  position: number;
}

/** Un enregistrement de la bibliothèque et tous ses emplacements. */
export interface LibraryEntryDto {
  uri: string;
  name: string;
  artists: string[];
  albumName: string;
  albumImageUrl: string | null;
  durationMs: number;
  /** Tous les endroits où ce morceau figure. Jamais vide. */
  locations: TrackLocationDto[];
}

/** Index complet de la bibliothèque : quel morceau se trouve où. */
export interface LibraryIndexDto {
  entries: LibraryEntryDto[];
  playlists: PlaylistSummaryDto[];
  likedCount: number;
  /** Date ISO de construction, pour informer sur la fraîcheur. */
  builtAt: string;
}

/** Un titre à qualifier, avec les playlists qui le contiennent déjà. */
export interface QualificationTrackDto extends PlaylistTrackDto {
  /** Playlists où ce titre figure déjà. Pré-cochées, mais jamais réajoutées. */
  inPlaylistIds: string[];
}

/** File d'attente de qualification des titres likés. */
export interface QualificationQueueDto {
  /** Prochains titres à traiter, dans l'ordre des likés. */
  tracks: QualificationTrackDto[];
  totalLiked: number;
  qualifiedCount: number;
  remainingCount: number;
  /** Playlists proposées comme destinations. */
  playlists: PlaylistSummaryDto[];
}

/** Résultat de la qualification d'un titre. */
export interface QualifyResultDto {
  uri: string;
  /** Playlists auxquelles le titre a été effectivement ajouté. */
  addedTo: string[];
  /** Playlists où il figurait déjà : aucun ajout, donc aucun doublon créé. */
  skipped: string[];
}

/** Une décision de qualification déjà enregistrée. */
export interface QualificationRecordDto {
  uri: string;
  qualifiedAt: string;
  playlistIds: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}
