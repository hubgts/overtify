import type {
  SpotifyImage,
  SpotifyPlaylist,
  SpotifyPlaylistTrackItem,
  SpotifyTrack,
  SpotifyUser,
} from '../types/spotify.js';
import type {
  PlaylistSummaryDto,
  PlaylistTrackDto,
  TrackDto,
  UserDto,
} from '../types/dto.js';

/**
 * Traduction des objets Spotify vers le contrat d'API d'Overtify.
 *
 * Fonctions pures, sans effet de bord : c'est ici qu'on absorbe les
 * bizarreries du modèle Spotify (champs nullables, tableaux d'images
 * hétérogènes) pour livrer au front des données prévisibles.
 */

/**
 * Choisit l'image adaptée à une taille d'affichage.
 *
 * Spotify fournit plusieurs résolutions, triées de la plus grande à la plus
 * petite. On retient la plus petite qui reste au moins aussi grande que la
 * zone d'affichage : plus petite serait floue une fois étirée, plus grande
 * gaspillerait de la bande passante.
 *
 * `minSize` est exprimé en pixels CSS et doublé pour rester net sur les écrans
 * à haute densité, où 1 pixel CSS occupe 2 pixels physiques.
 */
function pickImageUrl(
  images: SpotifyImage[] | null | undefined,
  minSize: number,
): string | null {
  if (images === null || images === undefined || images.length === 0) {
    return null;
  }

  const targetSize = minSize * 2;

  // Les dimensions peuvent être nulles ; ces entrées sont écartées du choix
  // par taille, mais restent utilisables en dernier recours.
  const sized = images.filter(
    (image): image is SpotifyImage & { width: number } => typeof image.width === 'number',
  );

  const suitable = sized
    .filter((image) => image.width >= targetSize)
    .sort((a, b) => a.width - b.width);

  // À défaut, la plus grande disponible reste le meilleur compromis.
  const largest = [...sized].sort((a, b) => b.width - a.width)[0];

  return suitable[0]?.url ?? largest?.url ?? images[0]?.url ?? null;
}

/**
 * Tailles d'affichage réelles, en pixels CSS.
 *
 * Elles doivent rester alignées sur les composants correspondants : une valeur
 * trop basse produit une image floue une fois étirée.
 */
const DISPLAY_SIZES = {
  /** Vignette de la sidebar et des lignes de morceaux (h-10 / h-12). */
  thumbnail: 48,
  /** Grande pochette de l'en-tête de playlist (h-40 = 160 px). */
  cover: 160,
  /** Avatar de la barre supérieure (h-7). */
  avatar: 28,
} as const;

export function toUserDto(user: SpotifyUser): UserDto {
  return {
    id: user.id,
    displayName: user.display_name ?? user.id,
    avatarUrl: pickImageUrl(user.images, DISPLAY_SIZES.avatar),
  };
}

/**
 * Extrait le nombre de morceaux d'une playlist.
 *
 * Spotify n'expose pas ce compteur de façon uniforme : `/playlists/{id}` le
 * place dans `tracks.total`, tandis que `/me/playlists` renvoie un champ
 * `items` — objet paginé ou tableau selon les cas. On lit les trois formes
 * plutôt que d'en supposer une seule, faute de quoi le compteur affichait 0
 * pour toutes les playlists.
 */
function extractTrackCount(playlist: SpotifyPlaylist): number {
  if (typeof playlist.tracks?.total === 'number') {
    return playlist.tracks.total;
  }

  if (Array.isArray(playlist.items)) {
    return playlist.items.length;
  }

  if (typeof playlist.items?.total === 'number') {
    return playlist.items.total;
  }

  return 0;
}

/**
 * Normalise la description d'une playlist.
 *
 * Spotify stocke littéralement la chaîne `"null"` quand une playlist est créée
 * sans description — et la renvoie telle quelle, ce qui l'affichait sous le
 * titre. Une chaîne vide est traitée de la même façon : absence de description.
 */
function normalizeDescription(description: string | null | undefined): string | null {
  if (description === null || description === undefined) {
    return null;
  }

  const trimmed = description.trim();

  return trimmed === '' || trimmed === 'null' ? null : trimmed;
}

/**
 * Convertit une playlist Spotify en résumé.
 *
 * Les champs facultatifs (pochette, description) tolèrent l'absence ; les
 * champs structurants sont lus via des accesseurs dédiés qui gèrent les
 * variations de forme de l'API.
 */
export function toPlaylistSummaryDto(playlist: SpotifyPlaylist): PlaylistSummaryDto {
  return {
    id: playlist.id,
    name: playlist.name,
    description: normalizeDescription(playlist.description),
    imageUrl: pickImageUrl(playlist.images, DISPLAY_SIZES.thumbnail),
    trackCount: extractTrackCount(playlist),
    isPublic: playlist.public ?? null,
    collaborative: playlist.collaborative ?? false,
    ownerName: playlist.owner?.display_name ?? playlist.owner?.id ?? 'Inconnu',
  };
}

/** URL de la grande pochette affichée en en-tête de playlist. */
export function pickCoverImageUrl(images: SpotifyImage[] | null | undefined): string | null {
  return pickImageUrl(images, DISPLAY_SIZES.cover);
}

export function toTrackDto(track: SpotifyTrack): TrackDto {
  return {
    id: track.id ?? null,
    uri: track.uri,
    name: track.name ?? 'Titre inconnu',
    artists: track.artists?.map((artist) => artist.name) ?? [],
    albumName: track.album?.name ?? '',
    albumImageUrl: pickImageUrl(track.album?.images, DISPLAY_SIZES.thumbnail),
    durationMs: track.duration_ms ?? 0,
    isLocal: track.is_local ?? false,
  };
}

/**
 * Extrait la piste d'une entrée de playlist.
 *
 * `/playlists/{id}/items` imbrique la piste sous `item` ; `track` est déprécié
 * mais reste présent dans certaines réponses. Lire uniquement `track` renvoyait
 * une playlist vide alors que la requête aboutissait — d'où cette lecture des
 * deux champs, `item` en priorité.
 */
function extractTrack(entry: SpotifyPlaylistTrackItem): SpotifyTrack | null {
  return entry.item ?? entry.track ?? null;
}

/**
 * Convertit les items d'une playlist en morceaux positionnés.
 *
 * `position` est l'index réel dans la playlist et doit être calculé avant tout
 * filtrage : c'est la coordonnée que Spotify attend pour supprimer une
 * occurrence précise. Les entrées sans piste (titre retiré du catalogue) sont
 * écartées, mais elles décalent les positions des suivantes.
 */
export function toPlaylistTrackDtos(items: SpotifyPlaylistTrackItem[]): PlaylistTrackDto[] {
  return items.flatMap((entry, position) => {
    const track = entry === null || entry === undefined ? null : extractTrack(entry);

    // Une entrée sans piste ou sans URI n'est ni affichable ni supprimable :
    // l'URI est la coordonnée exigée par Spotify pour toute mutation.
    if (track === null || !track.uri) {
      return [];
    }

    return [{ ...toTrackDto(track), position, addedAt: entry.added_at ?? null }];
  });
}
