import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Stockage JSON par utilisateur, avec cache mémoire.
 *
 * Extrait de `qualificationStore` quand une seconde donnée persistante est
 * apparue (les playlists retirées) : le mécanisme — chemin neutralisé, écriture
 * atomique, cache — est identique, seul le contenu diffère.
 *
 * Choix assumé face à SQLite : aucune dépendance, aucun schéma à migrer, et le
 * volume reste modeste. Si des requêtes croisées deviennent nécessaires, une
 * vraie base se justifiera (cf. décision n°20).
 */

/** Emplacement des données. Aligné sur le volume déclaré dans docker-compose. */
const DATA_DIR = process.env.OVERTIFY_DATA_DIR ?? './data';

/**
 * Chemin du fichier d'un utilisateur.
 *
 * L'identifiant est neutralisé : un identifiant Spotify ne contient
 * normalement que des caractères alphanumériques, mais on ne construit jamais
 * un chemin de fichier à partir d'une entrée externe sans la filtrer.
 */
function filePathFor(prefix: string, userId: string): string {
  const safeId = encodeURIComponent(userId).replace(/[^A-Za-z0-9._-]/g, '_');
  return join(DATA_DIR, `${prefix}-${safeId}.json`);
}

export class JsonStore<T> {
  private readonly cache = new Map<string, T>();

  constructor(
    /** Préfixe du fichier, qui identifie la nature des données stockées. */
    private readonly prefix: string,
    /** État initial, utilisé au premier usage ou si le fichier est illisible. */
    private readonly createEmpty: () => T,
    /** Garde de forme : protège d'un fichier corrompu ou d'un format ancien. */
    private readonly isValid: (value: unknown) => value is T,
  ) {}

  async load(userId: string): Promise<T> {
    const cached = this.cache.get(userId);

    if (cached !== undefined) {
      return cached;
    }

    let state: T;

    try {
      const raw = await readFile(filePathFor(this.prefix, userId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      state = this.isValid(parsed) ? parsed : this.createEmpty();
    } catch {
      // Fichier absent au premier usage, ou illisible : on repart d'un état
      // vide plutôt que de faire échouer la fonctionnalité.
      state = this.createEmpty();
    }

    this.cache.set(userId, state);
    return state;
  }

  /**
   * Écriture atomique : fichier temporaire puis renommage. Une coupure en
   * cours d'écriture laisse l'ancien fichier intact plutôt qu'un JSON tronqué.
   */
  async save(userId: string, state: T): Promise<void> {
    const path = filePathFor(this.prefix, userId);
    const temporaryPath = `${path}.tmp`;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(state), 'utf8');
    await rename(temporaryPath, path);

    this.cache.set(userId, state);
  }

  /** Remplace l'état par un état vide, sur disque et en cache. */
  async reset(userId: string): Promise<T> {
    const state = this.createEmpty();
    await this.save(userId, state);
    return state;
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
}
