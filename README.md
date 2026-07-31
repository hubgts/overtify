# Overtify

Une surcouche web à Spotify qui ajoute ce qui manque à l'application
officielle : **trier ses titres likés**, **organiser ses playlists** et
**éliminer les doublons que Spotify ne détecte pas**.

Le principe : faire ce que le client officiel ne fait pas, plutôt que refaire
ce qu'il fait déjà bien. Et ne jamais rien modifier sans votre accord explicite.

---

## Fonctionnalités

- **Connexion Spotify** en un clic (OAuth 2.0).
- **Vos playlists** listées et consultables (titre, artiste, album, durée, pochette).
- **Ajout** de morceaux par recherche dans le catalogue Spotify.
- **Suppression** d'un morceau précis.
- **Titres likés** gérés comme une playlist : consultation, ajout, retrait et
  dédoublonnage.
- **Qualification** : trier ses titres likés un par un vers une ou plusieurs
  playlists, avec mémoire de progression et réinitialisation.
- **Bibliothèque** : voir où se trouve chaque morceau, repérer ceux présents
  dans plusieurs playlists et les likés jamais rangés — et gérer leur
  appartenance (ajout et retrait) directement depuis la vue.
- **Dédoublonnage** en deux niveaux :
  - *identiques* — même enregistrement répété, présélectionné ;
  - *probables* — même titre et même artiste sous une autre édition, soumis à
    votre validation.

Overtify ne gère que **les playlists dont vous êtes propriétaire**, plus vos
**Titres likés**. Les playlists suivies n'apparaissent pas : elles ne sont de
toute façon pas modifiables.

---

## Démarrage rapide

Prérequis : **Docker** et **Docker Compose**. (Pour le mode développement,
Node.js 20+.)

```bash
# 1. Installer les dépendances et créer le .env
make init

# 2. Renseigner vos identifiants Spotify dans .env
#    → procédure détaillée : docs/SPOTIFY_SETUP.md

# 3. Lancer
make up
```

L'application est disponible sur **<http://127.0.0.1:8080>**.

> Utilisez bien `127.0.0.1` et non `localhost` : Spotify n'accepte plus
> `localhost` dans les Redirect URIs, et les deux sont des origines distinctes
> pour le navigateur.

**Vous n'avez pas encore d'identifiants Spotify ?**
→ [docs/SPOTIFY_SETUP.md](./docs/SPOTIFY_SETUP.md) décrit la création de
l'application pas à pas.

---

## Commandes

| Commande | Effet |
|---|---|
| `make help` | Liste toutes les cibles disponibles. |
| `make init` | Installe les dépendances, crée `.env`, génère un secret de session. |
| `make up` | Démarre les conteneurs. |
| `make down` | Arrête les conteneurs. |
| `make build` | Construit les images Docker. |
| `make logs` | Suit les logs des deux services. |
| `make restart` | Redémarre les conteneurs. |
| `make clean` | Supprime conteneurs et artefacts de build. |
| `make dev` | Mode développement avec rechargement à chaud. |
| `make test` | Tous les tests (hors ligne, déterministes). |
| `make test-contract` | Vérifie que l'API Spotify n'a pas changé (réseau). |
| `make logs-api` | Journal des échanges avec l'API Spotify. |
| `make check` | Typage TypeScript et tests. |

---

## Développement

```bash
make dev
```

Frontend sur <http://127.0.0.1:5173>, backend sur <http://127.0.0.1:3001>, les
deux avec rechargement à chaud.

Pensez à basculer `.env` sur les URLs de développement :

```dotenv
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
FRONTEND_URL=http://127.0.0.1:5173
```

(Déclarez les deux Redirect URIs dans le dashboard Spotify pour alterner
librement entre les modes.)

### Tests

```bash
make test           # 162 tests hors ligne : unitaires + bout en bout
make test-contract  # vérifie la vraie API Spotify (réseau requis)
```

Trois niveaux : unitaire (logique de dédoublonnage), bout en bout (parcours
complets avec un Spotify simulé), et contrat (détecte les changements de l'API
Spotify réelle — ce dernier existe parce que Spotify a retiré un endpoint en
cours de projet).

Détails : [docs/TESTS.md](./docs/TESTS.md).

---

## Structure

```
overtify/
├── backend/           API Fastify : OAuth, sessions, proxy Spotify
│   └── src/
│       ├── config/    Configuration validée au démarrage
│       ├── plugins/   Authentification, gestion d'erreurs
│       ├── routes/    Routage HTTP et validation
│       ├── services/  Logique métier et appels Spotify
│       └── types/     Types Spotify et contrat d'API
├── frontend/          SPA React + Vite + Tailwind
│   └── src/
│       ├── api/       Client HTTP
│       ├── components/ Composants d'affichage
│       ├── hooks/     État serveur (TanStack Query)
│       ├── pages/     Assemblage des vues
│       └── services/  Logique pure — dédoublonnage, filtres de bibliothèque
├── docs/              Documentation
├── logs/              Journal des échanges Spotify (ignoré par Git)
├── docker-compose.yml
└── Makefile
```

---

## Documentation

| Document | Contenu |
|---|---|
| [SPOTIFY_SETUP.md](./docs/SPOTIFY_SETUP.md) | Créer l'application Spotify, pas à pas. |
| [DECISIONS.md](./docs/DECISIONS.md) | **Journal des décisions** — métier et technique, avec leur motif. |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Choix techniques, sécurité, découpage. |
| [DEDUPLICATION.md](./docs/DEDUPLICATION.md) | Fonctionnement détaillé du dédoublonnage. |
| [TESTS.md](./docs/TESTS.md) | Stratégie de test et journal des échanges API. |
| [backend/README.md](./backend/README.md) | API et configuration du backend. |
| [frontend/README.md](./frontend/README.md) | Composants, thème, personnalisation. |

---

## Personnaliser la couleur d'accent

Une seule ligne à changer, dans
[`frontend/src/styles/theme.css`](./frontend/src/styles/theme.css) :

```css
@theme {
  --color-accent: #a855f7;  /* violet par défaut */
}
```

Toute l'interface suit. Aucune couleur n'est codée en dur dans les composants.

---

## Sécurité

- Le `client_secret` Spotify **ne quitte jamais le backend**.
- Le navigateur ne détient qu'un cookie de session `httpOnly`, illisible en
  JavaScript — aucun jeton Spotify n'est stocké côté client.
- Protection CSRF par `state` signé sur le flow OAuth et cookies `SameSite=Lax`.
- Le fichier `.env` est ignoré par Git.

Détails dans [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Stack

React 19 · TypeScript strict · Vite 6 · Tailwind CSS 4 · TanStack Query 5 ·
Fastify 5 · Zod · Vitest · Docker
