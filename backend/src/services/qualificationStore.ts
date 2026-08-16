import { JsonStore } from './jsonStore.js';

/**
 * Mémoire des titres likés déjà qualifiés.
 *
 * Contrairement aux sessions (volontairement éphémères, cf. décision n°2), cette
 * mémoire doit survivre aux redémarrages : un tri de plusieurs centaines de
 * titres s'étale sur plusieurs séances, et tout reperdre serait rédhibitoire.
 *
 * Le mécanisme de stockage lui-même vit dans `jsonStore.ts`, partagé avec la
 * mémoire des playlists retirées.
 */

export interface QualificationRecord {
  /** URI Spotify du morceau traité. */
  uri: string;
  /** Date ISO du traitement. */
  qualifiedAt: string;
  /** Playlists auxquelles il a été ajouté. Vide si le titre a été passé. */
  playlistIds: string[];
}

interface UserQualifications {
  version: 1;
  records: Record<string, QualificationRecord>;
}

function emptyState(): UserQualifications {
  return { version: 1, records: {} };
}

function isValid(value: unknown): value is UserQualifications {
  return (
    typeof value === 'object' &&
    value !== null &&
    'records' in value &&
    typeof (value as { records: unknown }).records === 'object'
  );
}

export class QualificationStore {
  private readonly store = new JsonStore<UserQualifications>(
    'qualifications',
    emptyState,
    isValid,
  );

  /** URI déjà traités par cet utilisateur. */
  async getQualifiedUris(userId: string): Promise<Set<string>> {
    const state = await this.store.load(userId);
    return new Set(Object.keys(state.records));
  }

  /** Marque un titre comme traité. `playlistIds` vide signifie « passé ». */
  async markQualified(
    userId: string,
    uri: string,
    playlistIds: string[],
  ): Promise<void> {
    const state = await this.store.load(userId);

    await this.store.save(userId, {
      ...state,
      records: {
        ...state.records,
        [uri]: { uri, qualifiedAt: new Date().toISOString(), playlistIds },
      },
    });
  }

  /** Annule le marquage d'un titre, qui redeviendra à traiter. */
  async unmark(userId: string, uri: string): Promise<void> {
    const state = await this.store.load(userId);

    if (state.records[uri] === undefined) {
      return;
    }

    const { [uri]: _removed, ...rest } = state.records;

    await this.store.save(userId, { ...state, records: rest });
  }

  /**
   * Efface tout l'historique de qualification.
   *
   * Utile après la création de nouvelles playlists : l'utilisateur veut alors
   * repasser sur l'ensemble de ses likés avec ces nouvelles destinations.
   */
  async reset(userId: string): Promise<void> {
    await this.store.reset(userId);
  }

  /** Historique complet, du plus récent au plus ancien. */
  async getHistory(userId: string): Promise<QualificationRecord[]> {
    const state = await this.store.load(userId);

    return Object.values(state.records).sort((a, b) =>
      b.qualifiedAt.localeCompare(a.qualifiedAt),
    );
  }

  /**
   * Vide le cache mémoire, forçant une relecture depuis le disque.
   *
   * Réservé aux tests : c'est ce qui permet de vérifier que les données sont
   * réellement persistées et non seulement gardées en mémoire.
   */
  clearCache(): void {
    this.store.clearCache();
  }
}

export const qualificationStore = new QualificationStore();
