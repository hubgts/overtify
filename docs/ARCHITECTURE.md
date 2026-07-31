# Architecture

Ce document décrit **comment** Overtify est construit. Le raisonnement derrière
chaque choix, et les options écartées, sont consignés dans
[DECISIONS.md](./DECISIONS.md).

Pour la mise en route, voir le [README](../README.md) ; pour les identifiants
Spotify, voir [SPOTIFY_SETUP.md](./SPOTIFY_SETUP.md).

---

## Vue d'ensemble

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────────┐
│ Navigateur  │        │ Backend Fastify  │        │  API Spotify    │
│             │        │                  │        │                 │
│  React SPA  │──/api─▶│  OAuth + proxy   │───────▶│  api.spotify    │
│             │◀───────│  sessions        │◀───────│  accounts       │
└─────────────┘ cookie └──────────────────┘ tokens └─────────────────┘
                httpOnly
```

Un principe gouverne l'ensemble : **aucun jeton Spotify n'atteint jamais le
navigateur.** Le front s'authentifie auprès du backend avec un cookie de
session opaque ; c'est le backend qui détient les jetons et appelle Spotify.

---

## Choix d'authentification

### Authorization Code Flow classique, pas PKCE

Spotify propose deux flows utilisables ici :

| | Authorization Code + PKCE | Authorization Code classique |
|---|---|---|
| Où vit le `client_secret` | nulle part (pas de secret) | backend uniquement |
| Où vit l'`access_token` | **dans le navigateur** | backend uniquement |
| Backend nécessaire | non | oui |
| Exposition au XSS | jeton volable via JS | rien à voler |

PKCE est la bonne réponse pour une application *purement* front, sans serveur.
Mais Overtify a besoin d'un backend de toute façon, et PKCE impose alors de
stocker l'`access_token` dans le navigateur (`localStorage` ou mémoire JS) : une
faille XSS, dans l'application ou dans l'une de ses dépendances, suffirait à
exfiltrer un jeton donnant accès aux playlists de l'utilisateur.

Le flow classique évite entièrement ce risque : le navigateur ne détient qu'un
identifiant de session **opaque**, dans un cookie `httpOnly` que JavaScript ne
peut pas lire. Le vol de ce cookie est nettement plus difficile, et la session
est révocable côté serveur.

### Défenses en place

| Risque | Réponse |
|---|---|
| Vol de jeton par XSS | Cookie `httpOnly` : illisible en JS. Aucun jeton côté client. |
| CSRF sur le flow OAuth | Paramètre `state` aléatoire, signé, comparé au retour. |
| CSRF sur les mutations | Cookie `SameSite=Lax` : le navigateur ne l'envoie pas sur les POST/DELETE cross-site. |
| Falsification de cookie | Cookies signés avec `SESSION_SECRET`. |
| Fuite du `client_secret` | Jamais transmis au front ; utilisé uniquement en Basic Auth serveur-à-serveur. |
| Jetons dans les logs | `redact` sur `authorization` et `cookie` dans le logger Fastify. |

---

## Persistance des sessions

Les sessions vivent dans une `Map` en mémoire
([`sessionStore.ts`](../backend/src/services/sessionStore.ts)).

**Conséquence assumée : redémarrer le backend déconnecte les utilisateurs.**

C'est acceptable pour un outil personnel mono-instance, et cela évite un
troisième service dans `docker-compose.yml`. La reconnexion prend un clic
(Spotify garde le consentement en mémoire).

Pour passer à un store persistant, `InMemorySessionStore` expose une interface
volontairement minimale — `create` / `get` / `updateTokens` / `destroy`. Une
implémentation Redis se substituerait sans toucher au reste du code.

### Cycle de vie des jetons

Le plugin [`authenticate.ts`](../backend/src/plugins/authenticate.ts) rafraîchit
l'`access_token` **avant** qu'il n'expire (marge de 60 secondes). Les routes
métier reçoivent donc toujours un client Spotify utilisable, et le front n'a
jamais à gérer d'expiration. Un 401 en provenance de Spotify signifie que le
`refresh_token` lui-même est révoqué : la seule issue est une reconnexion.

---

## Découpage en couches

### Backend

```
src/
├── config/      Configuration validée au démarrage (env, constantes Spotify)
├── plugins/     Préoccupations transverses (authentification, erreurs)
├── routes/      Routage HTTP et validation des entrées — aucune logique métier
├── services/    Logique métier et accès à l'API Spotify
├── types/       Types Spotify + contrat d'API (DTO)
└── utils/       Erreurs, cookies, httpClient (fetch injectable), apiLogger,
                 chunk (lots respectant les limites Spotify)
```

La règle : une route valide ses entrées et délègue ; toute la logique est dans
`services/`, ce qui la rend testable sans serveur HTTP.

### Frontend

```
src/
├── api/         Client HTTP et description des endpoints
├── components/  Composants d'affichage, sans logique métier
│   ├── layout/  Sidebar, barre supérieure
│   ├── playlist/ Table des morceaux, ajout
│   ├── dedupe/  Modale de dédoublonnage
│   ├── qualify/ Sélecteur de playlists de destination
│   ├── library/ Gestion de l'appartenance d'un morceau
│   └── ui/      Primitives réutilisables (AlbumCover, Button, Modal…)
├── hooks/       État serveur (TanStack Query) et logique React
├── pages/       Assemblage : orchestrent hooks et composants
├── services/    Logique métier pure, testable, sans React
│   ├── duplicates/  Détection de doublons ← cœur du produit
│   └── library/     Filtres, tri et statistiques de la bibliothèque
└── types/       Contrat d'API
```

Le point important : **la détection de doublons ne dépend ni de React ni du
réseau.** C'est une fonction `PlaylistTrackDto[] → DuplicateReport`, ce qui
permet de la couvrir par des tests unitaires rapides et de raisonner sur les cas
limites sans monter de composant.

---

## Contrat d'API

Les DTO sont déclarés en double :
[`backend/src/types/dto.ts`](../backend/src/types/dto.ts) et
[`frontend/src/types/api.ts`](../frontend/src/types/api.ts).

Cette duplication est délibérée : elle garde deux projets npm indépendants,
donc deux images Docker et deux installations séparées, sans introduire un
package partagé ni un outil de monorepo (workspaces, Nx…) pour deux fichiers.

**En contrepartie : toute modification doit être reportée des deux côtés.** Si
le projet grossit, extraire un `packages/shared-types` devient justifié.

### Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/health` | Sonde de vie (utilisée par Docker). |
| `GET` | `/api/auth/login` | Redirige vers le consentement Spotify. |
| `GET` | `/api/auth/callback` | Callback OAuth ; crée la session. |
| `GET` | `/api/auth/me` | Profil courant ; 401 si non connecté. |
| `POST` | `/api/auth/logout` | Détruit la session. |
| `GET` | `/api/playlists` | Titres likés + playlists **possédées**. |
| `GET` | `/api/playlists/:id` | Détail et morceaux (toutes pages). |
| `POST` | `/api/playlists/:id/tracks` | Ajoute des morceaux. |
| `DELETE` | `/api/playlists/:id/tracks` | Retire des occurrences précises. |
| `GET` | `/api/search/tracks` | Recherche dans le catalogue. |
| `GET` | `/api/library` | Index « quel morceau est où ». |
| `POST` | `/api/library/sync` | Aligne l'appartenance d'un morceau. |
| `GET` | `/api/qualification/queue` | Titres likés à trier et destinations. |
| `POST` | `/api/qualification/qualify` | Décision prise sur un titre. |
| `POST` | `/api/qualification/undo` | Annule une décision. |
| `POST` | `/api/qualification/reset` | Efface la progression du tri. |
| `GET` | `/api/qualification/history` | Historique des décisions. |

Toutes les erreurs partagent une forme unique :

```json
{ "error": { "code": "SPOTIFY_RATE_LIMITED", "message": "…", "retryAfterSeconds": 3 } }
```

---

## Gestion des erreurs

### Backend

Les erreurs métier héritent d'`AppError`
([`utils/errors.ts`](../backend/src/utils/errors.ts)), qui porte un code, un
statut HTTP et un message destiné à l'utilisateur. Le gestionnaire global
([`plugins/errorHandler.ts`](../backend/src/plugins/errorHandler.ts)) les
sérialise ; **toute autre erreur devient une 500 anonyme**, journalisée en
détail côté serveur mais sans fuite de stack trace vers le client.

### Rate limiting Spotify

[`spotifyClient.ts`](../backend/src/services/spotifyClient.ts) traite les 429 :

- `Retry-After ≤ 5 s` → attente puis nouvelle tentative, transparente ;
- `Retry-After > 5 s` → erreur remontée avec le délai, plutôt qu'une requête
  figée sans explication ;
- 5xx → back-off exponentiel, 2 tentatives supplémentaires.

Les appels paginés restent **séquentiels** : paralléliser 40 requêtes sur une
grosse playlist déclencherait précisément le rate limit qu'on cherche à éviter.

### Frontend

`ApiError` conserve le code métier, ce qui permet à
[`ErrorState.tsx`](../frontend/src/components/ui/ErrorState.tsx) de produire un
message actionnable plutôt qu'un statut HTTP brut. Les erreurs
d'authentification et de droits ne sont **jamais** réessayées : l'échec est
définitif, réessayer ne ferait que consommer du quota.

---

## Décisions notables

### Playlists possédées uniquement

`GET /api/playlists` filtre sur `owner.id === userId`, et toute mutation vérifie
la propriété avant d'appeler Spotify.

L'API Spotify refuserait de toute façon la modification d'une playlist tierce.
Filtrer en amont produit une interface plus honnête — pas de boutons grisés, pas
d'échec après coup — et un message d'erreur clair si l'identifiant est forcé.

### Endpoints Spotify : une dépendance mouvante

Spotify modifie son API sans préavis long. Deux changements ont directement
cassé Overtify pendant son développement :

| Date | Changement | Conséquence |
|---|---|---|
| avril 2025 | `localhost` interdit dans les Redirect URIs | Impossible d'enregistrer l'application. |
| 11 février 2026 | `/playlists/{id}/tracks` remplacé par `/playlists/{id}/items` | 403 sur tout affichage de playlist. |

S'y ajoute une divergence entre documentation et réalité : `/me/playlists`
renvoie le compteur de morceaux sous `items`, quand la documentation annonce
`tracks`.

Trois mesures en découlent :

1. **Chemin centralisé** — `playlistItemsPath()` dans
   [`config/spotify.ts`](../backend/src/config/spotify.ts) : une future
   migration ne demande qu'une seule modification.
2. **Lecture tolérante** — `extractTrackCount()` accepte les formes connues du
   compteur plutôt que d'en supposer une seule.
3. **Test de contrat** — `make test-contract` interroge la vraie API et signale
   tout endpoint devenu inaccessible (cf. [TESTS.md](./TESTS.md)).

### Suppression par position, jamais par URI seul

`DELETE /playlists/{id}/tracks` accepte deux formes. Avec un URI seul, Spotify
supprime **toutes** les occurrences de ce morceau — ce qui détruirait le
dédoublonnage, dont l'objet est justement d'en conserver une.

Overtify envoie donc toujours `{ uri, positions: [n] }`, et trie les
suppressions par **positions décroissantes** : sans ce tri, supprimer la
position 1 décalerait toutes les suivantes et la seconde suppression frapperait
le mauvais morceau. Ce comportement est verrouillé par un test
([`playlistService.test.ts`](../backend/src/services/playlistService.test.ts)).

Le `snapshot_id` accompagne chaque suppression : si la playlist a été modifiée
ailleurs entre-temps, Spotify rejette l'opération au lieu d'effacer au hasard.

### Rechargement plutôt que mise à jour optimiste

Après une mutation, le cache est invalidé et la playlist rechargée. Une mise à
jour optimiste serait plus fluide, mais les positions sont la clé des
suppressions : un cache désynchronisé ferait supprimer le mauvais morceau. La
correction prime sur la fluidité.

### Thème centralisé

Toutes les couleurs vivent dans le bloc `@theme` de
[`theme.css`](../frontend/src/styles/theme.css). Changer `--color-accent`
suffit à repeindre l'application — aucune couleur n'est codée en dur dans les
composants.

---

## Limites connues

| Limite | Raison |
|---|---|
| Sessions perdues au redémarrage | Store en mémoire (voir plus haut). |
| 5 utilisateurs maximum | Mode Development de l'API Spotify. |
| Titres locaux ignorés au dédoublonnage | Non manipulables de façon fiable via l'API. |
| Playlists suivies invisibles | Choix produit : Overtify ne gère que vos playlists. |
| Chargement complet avant analyse | La détection de doublons a besoin de toute la playlist ; ~40 requêtes pour 2 000 titres. |
| DTO dupliqués | Compromis assumé pour éviter un monorepo outillé. |
