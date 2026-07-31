# Overtify — Frontend

Application React (Vite + TypeScript) reprenant les codes visuels de Spotify :
sidebar de playlists, table de morceaux, thème sombre.

---

## Démarrage

Depuis la **racine du projet** :

```bash
make dev-frontend
```

Ou directement ici :

```bash
npm install
npm run dev
```

L'application est servie sur <http://127.0.0.1:5173>. Les appels `/api` sont
proxifiés vers le backend (<http://127.0.0.1:3001>) par Vite : une seule
origine côté navigateur, donc aucune problématique CORS en développement.

Le backend doit tourner en parallèle.

---

## Scripts

| Script | Effet |
|---|---|
| `npm run dev` | Serveur de développement. |
| `npm run build` | Typage puis build de production dans `dist/`. |
| `npm run preview` | Sert le build de production localement. |
| `npm test` | Tests unitaires (Vitest). |

---

## Personnaliser la couleur d'accent

**Une seule ligne à modifier**, dans [`src/styles/theme.css`](./src/styles/theme.css) :

```css
@theme {
  --color-accent: #a855f7;          /* violet par défaut */
  --color-accent-hover: #b975f9;    /* survol : même teinte, plus claire */
  --color-accent-contrast: #0a0a0f; /* texte posé SUR l'accent */
}
```

Toute l'interface suit — boutons, états actifs, indicateurs de chargement,
anneaux de focus. Aucune couleur n'est codée en dur dans les composants.

Si vous choisissez un accent **clair** (jaune, cyan pâle), pensez à passer
`--color-accent-contrast` à une valeur sombre pour préserver la lisibilité du
texte sur les boutons.

Le même bloc `@theme` contient les surfaces, les couleurs de texte et les
couleurs sémantiques (`danger`, `warning`, `success`).

---

## Organisation

```
src/
├── api/            client.ts (fetch + erreurs typées), endpoints.ts
├── components/
│   ├── dedupe/     DedupeModal, DedupeSummary, DuplicateGroupCard
│   ├── layout/     Sidebar, TopBar
│   ├── library/    ManageMembershipModal
│   ├── playlist/   PlaylistHeader, TrackTable, TrackRow, AddTrackModal
│   ├── qualify/    PlaylistPicker
│   └── ui/         AlbumCover, Button, Modal, Spinner, ErrorState
├── hooks/          useAuth, usePlaylists, useLibrary, useQualification,
│                   useInvalidateLibraryData (invalidation partagée)…
├── pages/          LoginPage, PlaylistPage, QualifyPage, LibraryPage
├── services/
│   ├── duplicates/ normalize, detectDuplicates, selection, summary (+ tests)
│   ├── library/    filterLibrary — filtres, tri, statistiques (+ tests)
│   ├── format.ts   Durées, listes d'artistes, pluriels
│   └── likedSongs.ts  Identifiant de la pseudo-playlist
├── styles/         theme.css — toutes les variables de design
└── types/          api.ts — contrat partagé avec le backend
```

Principe de découpage : les composants affichent et remontent des intentions,
les hooks gèrent l'état serveur, et `services/` contient la logique métier pure
— sans React ni réseau, donc directement testable.

---

## État serveur

[TanStack Query](https://tanstack.com/query) gère cache, états de chargement et
invalidations. Les clés sont centralisées dans
[`hooks/queryKeys.ts`](./src/hooks/queryKeys.ts).

Après une mutation, la playlist est **rechargée** plutôt que mise à jour de
façon optimiste : les positions des morceaux sont la clé des suppressions, et
un cache désynchronisé ferait supprimer le mauvais titre.

Toutes les mutations passent par `useInvalidateLibraryData()` plutôt que
d'énumérer les clés à invalider : chaque hook oubliait auparavant celles
auxquelles son auteur n'avait pas pensé — qualifier un titre laissait la vue
Bibliothèque périmée.

Les erreurs d'authentification et de droits ne sont jamais réessayées — l'échec
est définitif, réessayer ne ferait que consommer du quota Spotify.

---

## Dédoublonnage

Le cœur du produit vit dans
[`services/duplicates/`](./src/services/duplicates/) :

| Fichier | Rôle |
|---|---|
| `normalize.ts` | Réduit titres et artistes à une forme comparable. |
| `detectDuplicates.ts` | Regroupe les morceaux en doublons identiques ou probables. |
| `selection.ts` | Gère ce que l'utilisateur choisit de supprimer. |

Ces fonctions sont **pures** : mêmes entrées, mêmes sorties, aucune dépendance
à React ni au réseau. D'où 56 tests unitaires qui s'exécutent en une
demi-seconde.

Fonctionnement détaillé : [docs/DEDUPLICATION.md](../docs/DEDUPLICATION.md).

---

## Favicon

Le losange d'Overtify, dans [`public/`](./public/) : SVG (net à toute taille),
PNG 32 px et ICO en repli, plus une icône 180 px pour iOS.

Sa couleur doit rester alignée sur `--color-accent` : un SVG ne peut pas lire
une variable CSS du document, la valeur est donc dupliquée dans `favicon.svg`
et dans la balise `theme-color` d'`index.html`. Changer l'accent implique de
régénérer les PNG.

---

## Accessibilité

- Navigation clavier complète ; anneau de focus visible au clavier uniquement.
- Modales : `role="dialog"`, `aria-modal`, fermeture par Échap, focus déplacé
  à l'ouverture, défilement de la page verrouillé.
- Les actions au survol (bouton de suppression) restent dans le DOM et
  atteignables au clavier.
- Messages d'erreur en `role="alert"`, chargements en `role="status"`.
- `prefers-reduced-motion` respecté.

---

## Tests

```bash
npm test
```

Couvrent la normalisation (y compris les variantes à **ne pas** fusionner :
live, acoustic, remix), le regroupement, le chevauchement entre doublons
identiques et probables, et la cohérence position ↔ URI de la sélection.
