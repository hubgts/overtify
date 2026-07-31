import { randomBytes } from 'node:crypto';

/**
 * Session utilisateur : tout ce qui ne doit jamais atteindre le navigateur.
 */
export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Timestamp epoch ms d'expiration de l'access token. */
  expiresAt: number;
}

/** Durée de vie d'une session inactive (7 jours), alignée sur le cookie. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Fréquence du balayage des sessions expirées. */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface StoredSession extends Session {
  lastSeenAt: number;
}

/**
 * Store de sessions en mémoire.
 *
 * Choix assumé pour un déploiement mono-instance et mono-utilisateur :
 * redémarrer le backend invalide les sessions et impose une reconnexion.
 * Passer à Redis reviendrait à réimplémenter cette même interface
 * (cf. docs/ARCHITECTURE.md, section « Persistance des sessions »).
 */
export class InMemorySessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.removeExpired(), CLEANUP_INTERVAL_MS);
    // N'empêche pas le process de se terminer proprement.
    this.cleanupTimer.unref();
  }

  create(data: Omit<Session, 'id'>): Session {
    const id = randomBytes(32).toString('hex');
    const session: StoredSession = { ...data, id, lastSeenAt: Date.now() };

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | null {
    const session = this.sessions.get(id);

    if (session === undefined) {
      return null;
    }

    if (Date.now() - session.lastSeenAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return null;
    }

    session.lastSeenAt = Date.now();
    return session;
  }

  /** Met à jour les tokens après un refresh. */
  updateTokens(
    id: string,
    tokens: Pick<Session, 'accessToken' | 'refreshToken' | 'expiresAt'>,
  ): void {
    const session = this.sessions.get(id);

    if (session !== undefined) {
      Object.assign(session, tokens, { lastSeenAt: Date.now() });
    }
  }

  destroy(id: string): void {
    this.sessions.delete(id);
  }

  private removeExpired(): void {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionStore = new InMemorySessionStore();
