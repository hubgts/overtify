import type { LibraryIndexDto } from '../types/dto.js';

/**
 * Cache de l'index de bibliothèque.
 *
 * Construire l'index coûte environ 25 requêtes Spotify et quelques secondes ;
 * le refaire à chaque navigation serait inutilisable. Le cache le conserve en
 * mémoire, par utilisateur.
 *
 * **Invalidation explicite plutôt que durée de vie.** Overtify sait exactement
 * quand la bibliothèque change, puisque c'est lui qui la modifie : chaque
 * mutation invalide l'entrée correspondante. Une expiration par minuterie
 * servirait des données périmées ou rechargerait sans raison.
 *
 * Limite assumée : une modification faite depuis l'application Spotify
 * officielle n'est pas détectée. D'où le rafraîchissement manuel exposé par
 * l'API (`?refresh=true`), et un plafond de fraîcheur en dernier recours.
 */

/** Au-delà, l'index est reconstruit même sans mutation connue. */
const MAX_AGE_MS = 15 * 60 * 1000;

interface CacheEntry {
  index: LibraryIndexDto;
  storedAt: number;
}

export class LibraryCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** Index en cache s'il est exploitable, sinon null. */
  get(userId: string): LibraryIndexDto | null {
    const entry = this.entries.get(userId);

    if (entry === undefined) {
      return null;
    }

    if (Date.now() - entry.storedAt > MAX_AGE_MS) {
      this.entries.delete(userId);
      return null;
    }

    return entry.index;
  }

  set(userId: string, index: LibraryIndexDto): void {
    this.entries.set(userId, { index, storedAt: Date.now() });
  }

  /**
   * Invalide l'index d'un utilisateur.
   *
   * À appeler après toute modification de playlist ou de titres likés : sans
   * cela, la vue afficherait un état que l'utilisateur vient de changer.
   */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  /** Vide tout le cache. Réservé aux tests. */
  clear(): void {
    this.entries.clear();
  }
}

export const libraryCache = new LibraryCache();
