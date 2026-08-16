import { JsonStore } from './jsonStore.js';

/**
 * Mémoire des playlists retirées de la bibliothèque.
 *
 * Spotify ne supprime pas une playlist : on s'en « désabonne », et elle
 * disparaît alors de `/me/playlists`. Sans mémoire locale, Overtify serait
 * incapable de la réafficher — donc incapable de proposer un réabonnement.
 *
 * Ce store conserve donc l'essentiel de la playlist au moment du retrait, ce
 * qui permet de l'afficher grisée et de la restaurer d'un clic.
 */

export interface RemovedPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  /** Date ISO du retrait, affichée pour situer l'action. */
  removedAt: string;
}

interface RemovedPlaylistsState {
  version: 1;
  playlists: Record<string, RemovedPlaylist>;
}

function emptyState(): RemovedPlaylistsState {
  return { version: 1, playlists: {} };
}

function isValid(value: unknown): value is RemovedPlaylistsState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'playlists' in value &&
    typeof (value as { playlists: unknown }).playlists === 'object'
  );
}

const store = new JsonStore<RemovedPlaylistsState>('removed-playlists', emptyState, isValid);

/** Enregistre une playlist retirée, pour pouvoir la réafficher et la restaurer. */
export async function rememberRemoved(
  userId: string,
  playlist: RemovedPlaylist,
): Promise<void> {
  const state = await store.load(userId);

  await store.save(userId, {
    ...state,
    playlists: { ...state.playlists, [playlist.id]: playlist },
  });
}

/** Oublie une playlist restaurée : elle redevient une playlist ordinaire. */
export async function forgetRemoved(userId: string, playlistId: string): Promise<void> {
  const state = await store.load(userId);

  if (state.playlists[playlistId] === undefined) {
    return;
  }

  const { [playlistId]: _removed, ...rest } = state.playlists;

  await store.save(userId, { ...state, playlists: rest });
}

/** Playlists retirées, de la plus récente à la plus ancienne. */
export async function listRemoved(userId: string): Promise<RemovedPlaylist[]> {
  const state = await store.load(userId);

  return Object.values(state.playlists).sort((a, b) =>
    b.removedAt.localeCompare(a.removedAt),
  );
}

/** Réservé aux tests : force la relecture depuis le disque. */
export function clearRemovedCache(): void {
  store.clearCache();
}
