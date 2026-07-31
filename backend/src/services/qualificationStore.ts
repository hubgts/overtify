import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Mémoire des titres likés déjà qualifiés.
 *
 * Contrairement aux sessions (volontairement éphémères, cf. décision n°2), cette
 * mémoire doit survivre aux redémarrages : un tri de plusieurs centaines de
 * titres s'étale sur plusieurs séances, et tout reperdre serait rédhibitoire.
 *
 * Stockage : un fichier JSON par utilisateur, dans un volume Docker. Choix
 * assumé face à SQLite — aucune dépendance, aucun schéma à migrer, et le
 * volume de données reste modeste (quelques milliers d'URI par utilisateur).
 * Si d'autres fonctionnalités demandent des requêtes croisées, une vraie base
 * deviendra justifiée.
 */

/** Emplacement des données. Aligné sur le volume déclaré dans docker-compose. */
const DATA_DIR = process.env.OVERTIFY_DATA_DIR ?? './data';

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

/**
 * Chemin du fichier d'un utilisateur.
 *
 * L'identifiant est encodé : un identifiant Spotify ne contient normalement
 * que des caractères alphanumériques, mais on ne construit jamais un chemin
 * de fichier à partir d'une entrée externe sans la neutraliser.
 */
function filePathFor(userId: string): string {
  const safeId = encodeURIComponent(userId).replace(/[^A-Za-z0-9._-]/g, '_');
  return join(DATA_DIR, `qualifications-${safeId}.json`);
}

function isUserQualifications(value: unknown): value is UserQualifications {
  return (
    typeof value === 'object' &&
    value !== null &&
    'records' in value &&
    typeof (value as { records: unknown }).records === 'object'
  );
}

/**
 * Store de qualification, avec cache mémoire.
 *
 * Les lectures passent par le cache ; les écritures sont propagées sur disque
 * de façon atomique. Le cache évite de relire le fichier à chaque titre traité.
 */
export class QualificationStore {
  private readonly cache = new Map<string, UserQualifications>();

  private async load(userId: string): Promise<UserQualifications> {
    const cached = this.cache.get(userId);

    if (cached !== undefined) {
      return cached;
    }

    let state: UserQualifications;

    try {
      const raw = await readFile(filePathFor(userId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      state = isUserQualifications(parsed) ? parsed : emptyState();
    } catch {
      // Fichier absent au premier usage, ou illisible : on repart d'un état
      // vide plutôt que de faire échouer la fonctionnalité.
      state = emptyState();
    }

    this.cache.set(userId, state);
    return state;
  }

  /**
   * Écriture atomique : on écrit dans un fichier temporaire puis on le
   * renomme. Une coupure en cours d'écriture laisse ainsi l'ancien fichier
   * intact plutôt qu'un JSON tronqué.
   */
  private async persist(userId: string, state: UserQualifications): Promise<void> {
    const path = filePathFor(userId);
    const temporaryPath = `${path}.tmp`;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(state), 'utf8');
    await rename(temporaryPath, path);
  }

  /** URI déjà traités par cet utilisateur. */
  async getQualifiedUris(userId: string): Promise<Set<string>> {
    const state = await this.load(userId);
    return new Set(Object.keys(state.records));
  }

  /** Marque un titre comme traité. `playlistIds` vide signifie « passé ». */
  async markQualified(
    userId: string,
    uri: string,
    playlistIds: string[],
  ): Promise<void> {
    const state = await this.load(userId);

    state.records[uri] = {
      uri,
      qualifiedAt: new Date().toISOString(),
      playlistIds,
    };

    await this.persist(userId, state);
  }

  /** Annule le marquage d'un titre, qui redeviendra à traiter. */
  async unmark(userId: string, uri: string): Promise<void> {
    const state = await this.load(userId);

    if (state.records[uri] !== undefined) {
      delete state.records[uri];
      await this.persist(userId, state);
    }
  }

  /**
   * Efface tout l'historique de qualification.
   *
   * Utile après la création de nouvelles playlists : l'utilisateur veut alors
   * repasser sur l'ensemble de ses likés avec ces nouvelles destinations.
   */
  async reset(userId: string): Promise<void> {
    const state = emptyState();
    this.cache.set(userId, state);
    await this.persist(userId, state);
  }

  /**
   * Vide le cache mémoire, forçant une relecture depuis le disque.
   *
   * Réservé aux tests : c'est ce qui permet de vérifier que les données sont
   * réellement persistées et non seulement gardées en mémoire.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** Historique complet, du plus récent au plus ancien. */
  async getHistory(userId: string): Promise<QualificationRecord[]> {
    const state = await this.load(userId);

    return Object.values(state.records).sort((a, b) =>
      b.qualifiedAt.localeCompare(a.qualifiedAt),
    );
  }
}

export const qualificationStore = new QualificationStore();
