import { getLikedSongsDetail } from './likedSongsService.js';
import { listOwnedPlaylists } from './playlistService.js';
import { addTracksToPlaylist } from './playlistService.js';
import { findPlaylistsContaining, getLibraryIndex } from './libraryIndexService.js';
import { qualificationStore } from './qualificationStore.js';
import type { SpotifyClient } from './spotifyClient.js';
import type {
  PlaylistTrackDto,
  QualificationQueueDto,
  QualifyResultDto,
} from '../types/dto.js';

/**
 * Qualification des titres likés.
 *
 * Principe : présenter un titre liké à la fois, laisser l'utilisateur le
 * ranger dans une ou plusieurs playlists, puis passer au suivant. Les titres
 * traités ne réapparaissent plus, jusqu'à réinitialisation explicite.
 *
 * Choix structurant : l'opération est **non destructive**. Le titre est ajouté
 * aux playlists choisies mais reste dans les Titres likés, qui demeurent la
 * collection de référence ; les playlists deviennent des vues thématiques.
 */

/** Nombre de titres renvoyés d'avance, pour éviter un aller-retour par titre. */
const QUEUE_SIZE = 20;

/**
 * Construit la file d'attente : titres likés non encore traités.
 *
 * L'ordre des likés est conservé (Spotify les renvoie du plus récent au plus
 * ancien) : l'utilisateur traite donc ses ajouts récents en premier, ce qui
 * correspond à l'usage attendu.
 */
export async function getQualificationQueue(
  client: SpotifyClient,
  userId: string,
): Promise<QualificationQueueDto> {
  const [likedSongs, playlists, qualifiedUris] = await Promise.all([
    getLikedSongsDetail(client),
    listOwnedPlaylists(client, userId),
    qualificationStore.getQualifiedUris(userId),
  ]);

  const pending = likedSongs.tracks.filter((track) => !qualifiedUris.has(track.uri));
  const visible = pending.slice(0, QUEUE_SIZE);

  // Réutilise l'index de bibliothèque, mis en cache : sans cela, chaque
  // ouverture de la file rechargerait toutes les playlists une seconde fois.
  const index = await getLibraryIndex(client, userId);

  return {
    tracks: visible.map((track) => ({
      ...track,
      inPlaylistIds: findPlaylistsContaining(index, track.uri),
    })),
    totalLiked: likedSongs.tracks.length,
    qualifiedCount: likedSongs.tracks.length - pending.length,
    remainingCount: pending.length,
    playlists,
  };
}

/**
 * Enregistre la décision prise sur un titre.
 *
 * `playlistIds` vide correspond au bouton « Passer » : le titre est marqué
 * traité sans modification côté Spotify. C'est une décision à part entière
 * — « celui-ci reste simplement dans mes likés » — et non un abandon.
 *
 * L'ajout aux playlists précède le marquage : si Spotify refuse l'opération,
 * le titre reste à traiter plutôt que d'être marqué à tort.
 */
export async function qualifyTrack(
  client: SpotifyClient,
  userId: string,
  uri: string,
  playlistIds: string[],
): Promise<QualifyResultDto> {
  const addedTo: string[] = [];
  const skipped: string[] = [];

  /**
   * Garde-fou : une playlist cochée parce que le titre s'y trouve déjà ne doit
   * pas provoquer un réajout. Ce serait créer précisément le doublon strict que
   * l'application sert à éliminer. On vérifie donc l'appartenance réelle avant
   * chaque ajout, plutôt que de faire confiance à ce que le client envoie.
   */
  // L'appartenance est lue depuis l'index en cache plutôt qu'en rechargeant
  // chaque playlist : une playlist de 500 titres coûtait 11 requêtes pour un
  // simple test de présence. L'index reste fiable, chaque mutation
  // l'invalidant (cf. décision 22).
  const index = await getLibraryIndex(client, userId);
  const currentlyIn = new Set(findPlaylistsContaining(index, uri));

  for (const playlistId of playlistIds) {
    if (currentlyIn.has(playlistId)) {
      skipped.push(playlistId);
      continue;
    }

    await addTracksToPlaylist(client, playlistId, userId, [uri]);
    addedTo.push(playlistId);
  }

  // L'historique retient toutes les playlists validées, ajoutées ou déjà
  // présentes : c'est bien la destination voulue par l'utilisateur.
  await qualificationStore.markQualified(userId, uri, [...addedTo, ...skipped]);

  return { uri, addedTo, skipped };
}

/** Annule la dernière décision : le titre redevient à traiter. */
export async function unqualifyTrack(userId: string, uri: string): Promise<void> {
  await qualificationStore.unmark(userId, uri);
}

/**
 * Réinitialise l'historique.
 *
 * Cas d'usage principal : de nouvelles playlists ont été créées, et
 * l'utilisateur veut repasser sur l'ensemble de ses likés pour les y ranger.
 * Aucune donnée Spotify n'est touchée — seule la mémoire d'Overtify est effacée.
 */
export async function resetQualifications(userId: string): Promise<void> {
  await qualificationStore.reset(userId);
}

/** Historique des décisions, pour l'annulation et l'affichage. */
export async function getQualificationHistory(userId: string) {
  return qualificationStore.getHistory(userId);
}

/** Réexporté pour les tests, qui manipulent des morceaux de playlist. */
export type { PlaylistTrackDto };
