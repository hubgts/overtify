# Overtify — Backend

API Fastify assurant deux rôles : gérer le flow OAuth Spotify (le
`client_secret` ne doit jamais atteindre le navigateur) et proxifier les appels
à l'API Spotify pour le frontend.

---

## Démarrage

Depuis la **racine du projet** :

```bash
make dev-backend
```

Ou directement ici, avec les variables d'environnement chargées :

```bash
npm install
set -a && . ../.env && set +a
npm run dev
```

Le serveur écoute sur <http://127.0.0.1:3001>.

---

## Scripts

| Script | Effet |
|---|---|
| `npm run dev` | Développement avec rechargement à chaud (tsx). |
| `npm run build` | Compile TypeScript vers `dist/`. |
| `npm start` | Exécute le build de production. |
| `npm run typecheck` | Vérifie le typage sans émettre. |
| `npm test` | Tests unitaires et de bout en bout (hors ligne). |
| `npm run test:e2e` | Uniquement les parcours de bout en bout. |
| `npm run test:contract` | Vérifie la vraie API Spotify (réseau requis). |

---

## Configuration

Les variables sont validées au démarrage par
[`config/env.ts`](./src/config/env.ts) : une configuration incomplète provoque
un arrêt immédiat avec un message explicite, plutôt qu'une erreur OAuth
obscure à la première connexion.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | oui | Identifiant de l'application Spotify. |
| `SPOTIFY_CLIENT_SECRET` | oui | Secret — reste côté serveur. |
| `SPOTIFY_REDIRECT_URI` | oui | Doit correspondre au dashboard Spotify. |
| `FRONTEND_URL` | oui | Origine autorisée en CORS, cible de redirection. |
| `SESSION_SECRET` | oui | Signature des cookies (32 caractères minimum). |
| `PORT` | non | Port d'écoute (3001 par défaut). |
| `HOST` | non | Interface d'écoute (`0.0.0.0` par défaut). |
| `NODE_ENV` | non | `development` par défaut. |
| `SPOTIFY_LOG_FILE` | non | Journal des échanges Spotify. Vide = désactivé. |

Voir [`.env.example`](../.env.example) à la racine.

---

## Endpoints

| Méthode | Route | Authentifié | Rôle |
|---|---|:---:|---|
| `GET` | `/api/health` | — | Sonde de vie. |
| `GET` | `/api/auth/login` | — | Redirige vers le consentement Spotify. |
| `GET` | `/api/auth/callback` | — | Callback OAuth ; crée la session. |
| `GET` | `/api/auth/me` | oui | Profil de l'utilisateur connecté. |
| `POST` | `/api/auth/logout` | — | Détruit la session. |
| `GET` | `/api/playlists` | oui | Titres likés + playlists possédées. |
| `POST` | `/api/playlists` | oui | Crée une playlist vide (privée par défaut). |
| `PUT` | `/api/playlists/:id` | oui | Renomme, modifie description et visibilité. |
| `DELETE` | `/api/playlists/:id` | oui | Retire de la bibliothèque (désabonnement, réversible). |
| `GET` | `/api/playlists/removed` | oui | Playlists retirées, restaurables. |
| `POST` | `/api/playlists/:id/restore` | oui | Réaffiche une playlist retirée. |
| `GET` | `/api/playlists/:id` | oui | Détail et morceaux (toutes pages). |
| `POST` | `/api/playlists/:id/tracks` | oui | Ajoute des morceaux. |
| `DELETE` | `/api/playlists/:id/tracks` | oui | Retire des occurrences précises. |
| `GET` | `/api/search/tracks` | oui | Recherche dans le catalogue. |
| `GET` | `/api/library` | oui | Index « quel morceau est où » (`?refresh=true` force la reconstruction). |
| `POST` | `/api/library/sync` | oui | Aligne l'appartenance d'un morceau : ajoute et retire. |
| `GET` | `/api/qualification/queue` | oui | Titres likés restant à trier + destinations. |
| `POST` | `/api/qualification/qualify` | oui | Enregistre la décision prise sur un titre. |
| `POST` | `/api/qualification/undo` | oui | Annule une décision. |
| `POST` | `/api/qualification/reset` | oui | Efface la progression du tri. |
| `GET` | `/api/qualification/history` | oui | Historique des décisions. |

Toutes les erreurs partagent la même forme :

```json
{
  "error": {
    "code": "SPOTIFY_RATE_LIMITED",
    "message": "Trop de requêtes envoyées à Spotify. Réessayez dans 3 seconde(s).",
    "retryAfterSeconds": 3
  }
}
```

Codes possibles : `UNAUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN`,
`NOT_FOUND`, `VALIDATION_ERROR`, `SPOTIFY_RATE_LIMITED`,
`SPOTIFY_UNAVAILABLE`, `INTERNAL_ERROR`.

---

## Organisation

```
src/
├── config/     env.ts (validation Zod), spotify.ts (chemins, scopes)
├── plugins/    authenticate.ts (session + refresh), errorHandler.ts
├── routes/     auth, playlists, library, qualification — validation et
│               délégation ; schemas.ts porte les schémas Zod partagés
├── services/   spotifyClient, spotifyAuth, sessionStore, playlistService,
│               likedSongsService, libraryIndexService, libraryCache,
│               qualificationService, qualificationStore, mappers,
│               jsonStore (persistance partagée), removedPlaylistStore
├── types/      spotify.ts (API Spotify), dto.ts (contrat frontend)
└── utils/      errors, cookies, httpClient, apiLogger, chunk
```

Les routes valident et délèguent ; la logique vit dans `services/`, ce qui la
rend testable sans serveur HTTP.

---

## Points d'attention

**Rafraîchissement des jetons.** Le plugin `authenticate` renouvelle
l'`access_token` 60 secondes avant expiration. Les routes métier reçoivent
toujours un client utilisable et n'ont jamais à gérer l'expiration.

**Rate limiting.** `spotifyClient` traite les 429 : attente et nouvelle
tentative si `Retry-After ≤ 5 s`, sinon l'erreur est remontée avec le délai.
Les appels paginés restent séquentiels, précisément pour éviter de déclencher
la limite.

**Invalidation du cache.** Les cinq fonctions de mutation (`addTracksToPlaylist`,
`removeTracksFromPlaylist`, `addLikedSongs`, `removeLikedSongs`,
`syncTrackMembership`) invalident elles-mêmes l'index de bibliothèque. Une
nouvelle route mutante hérite donc du comportement sans rien à retenir.

**Endpoint des morceaux.** Spotify a remplacé `/playlists/{id}/tracks` par
`/playlists/{id}/items` le 11 février 2026 ; l'ancien renvoie 403. Le chemin est
centralisé dans `playlistItemsPath()` ([`config/spotify.ts`](./src/config/spotify.ts))
pour qu'une future migration ne touche qu'un seul endroit.

**Suppression par position.** `removeTracksFromPlaylist` envoie toujours
`{ uri, positions }` et trie par positions décroissantes. Sans ce tri, la
suppression d'une position décalerait les suivantes. Comportement couvert par
un test.

**Titres likés.** Routés vers `/me/tracks` par `likedSongsService.ts` :
suppression par identifiant, sans position ni `snapshot_id`. L'identifiant
réservé `liked-songs` les distingue des playlists.

**Sessions en mémoire.** Redémarrer le backend déconnecte les utilisateurs.
Choix assumé, documenté dans
[ARCHITECTURE.md](../docs/ARCHITECTURE.md#persistance-des-sessions).

---

## Tests

```bash
npm test              # 107 tests hors ligne
npm run test:contract # vérifie que l'API Spotify n'a pas changé
```

**Unitaires** — règles métier sensibles : garde de propriété, ordre décroissant
des suppressions, transmission du `snapshot_id`, tolérance aux réponses
Spotify incomplètes.

**Bout en bout** ([`src/e2e/`](./src/e2e/)) — l'application complète est montée
et interrogée comme par le navigateur, avec un Spotify simulé. Le simulateur
reproduit les erreurs réelles de l'API (dont le 403 sur l'endpoint retiré), ce
qui fait échouer les tests si le code régresse.

**Contrat** — interroge la vraie API pour détecter un endpoint disparu. Exclu
de `npm test` car il dépend du réseau.

Détails : [docs/TESTS.md](../docs/TESTS.md).
