# Overtify — guide de contribution

Surcouche web à Spotify : tri des titres likés, gestion des playlists et
dédoublonnage. Principe directeur — **faire ce que le client officiel ne fait
pas**, pas le réimplémenter.

Monorepo : `backend/` (Fastify) et `frontend/` (React + Vite).

Avant de modifier quoi que ce soit, lire [docs/DECISIONS.md](./docs/DECISIONS.md) :
il recense les choix structurants et ce qui a été écarté. Plusieurs
comportements qui paraissent perfectibles sont **volontaires**.

---

## Commandes

```bash
make up              # démarre les conteneurs → http://127.0.0.1:8080
make test            # tous les tests hors ligne (déterministes)
make test-contract   # vérifie la vraie API Spotify (réseau + .env requis)
make logs-api        # journal des échanges Spotify
make check           # typage + tests
```

L'application s'ouvre sur **`127.0.0.1`**, jamais `localhost` : ce sont deux
origines distinctes pour le navigateur, et le cookie de session ne suit pas.

---

## Règles non négociables

**Rien n'est supprimé sans validation explicite de l'utilisateur.** Les doublons
stricts sont pré-cochés, les probables non. Ne pas introduire de suppression
automatique.

**Suppression par `(uri, positions)`, jamais par `uri` seul.** L'`uri` seul
retire *toutes* les occurrences et détruirait le dédoublonnage. Trier par
positions décroissantes, transmettre le `snapshot_id`.

**Un faux positif coûte plus cher qu'un doublon manqué.** `live`, `acoustic`,
`remix` désignent des enregistrements différents : ne jamais les fusionner.

**Une case pré-cochée ne déclenche jamais de réajout.** Les playlists contenant
déjà le titre sont cochées pour informer ; le serveur vérifie l'appartenance
avant tout ajout. Sans cette garde, l'outil créerait les doublons qu'il élimine.

**Spotify ne supprime pas les playlists.** Seul `DELETE .../followers`
(désabonnement) existe : l'interface parle de « retirer », les playlists
retirées restent affichées grisées et restaurables. Ne pas réintroduire le
vocabulaire « supprimer ».

**La qualification est non destructive.** Ranger un titre liké dans une
playlist ne le retire jamais des likés : ceux-ci sont la collection de
référence. Ne pas introduire de retrait automatique.

**Les DTO sont dupliqués** entre `backend/src/types/dto.ts` et
`frontend/src/types/api.ts` : toute modification va des deux côtés.

**Pas de repli silencieux sur un champ structurant.** Un `?? 0` sur un compteur
transforme un crash visible en donnée fausse — erreur déjà commise. Le repli est
réservé aux champs décoratifs (pochette, description).

---

## L'API Spotify diverge de sa documentation

Vérifié à plusieurs reprises sur ce projet :

| Attendu | Réalité |
|---|---|
| `/playlists/{id}/tracks` | **403** — remplacé par `/items` le 11/02/2026 |
| Compteur sous `tracks.total` | Souvent sous `items` dans `/me/playlists` |
| Piste sous `item.track` | Sous `item.item` ; `track` est déprécié |
| `localhost` en Redirect URI | Refusé depuis avril 2025 — utiliser `127.0.0.1` |

**En cas de comportement inexpliqué, lire la réponse brute avant de supposer :**

```bash
make logs-api-pretty
```

C'est ce journal qui a identifié la migration d'endpoint, après deux hypothèses
fausses. Les chemins sont centralisés dans `backend/src/config/spotify.ts`.

---

## Tests

Trois niveaux — détail dans [docs/TESTS.md](./docs/TESTS.md) :

- **unitaire** — logique pure, surtout `frontend/src/services/duplicates/` ;
- **bout en bout** — application complète, Spotify simulé ;
- **contrat** — vraie API, détecte les endpoints retirés.

**Le simulateur doit rester fidèle à l'API réelle.** Il renvoie délibérément 403
sur l'endpoint retiré. Un simulateur complaisant valide du code cassé : c'est
arrivé, les tests passaient pendant que la production échouait.

**Un correctif s'accompagne d'un test dont on a vérifié qu'il échoue sans lui.**
Réintroduire le bug, constater l'échec, restaurer le correctif. Sans cette
vérification, rien ne prouve que le test protège de quoi que ce soit.

---

## Organisation

```
backend/src/
├── config/     env (validé au démarrage), spotify (chemins, scopes)
├── plugins/    authenticate (session + refresh), errorHandler
├── routes/     routage et validation — aucune logique métier
├── services/   logique métier et appels Spotify
├── types/      spotify.ts (API) · dto.ts (contrat frontend)
└── utils/      errors, cookies, httpClient, apiLogger

frontend/src/
├── api/          client HTTP et endpoints
├── components/   affichage, sans logique métier
├── hooks/        état serveur (TanStack Query)
├── pages/        assemblage
├── services/     logique pure — duplicates/ est le cœur du produit
└── styles/       theme.css — toutes les couleurs
```

Les routes valident et délèguent ; la logique vit dans `services/`.

**`frontend/src/services/duplicates/` ne dépend ni de React ni du réseau.**
Préserver cette propriété : c'est ce qui rend la détection testable simplement.

---

## Périmètre

Playlists **possédées** uniquement, plus les **Titres likés**. Les playlists
suivies ne sont pas affichées — Spotify en refuserait l'écriture.

Les Titres likés sont une pseudo-playlist (identifiant `liked-songs`) routée
vers `/me/tracks` : suppression par identifiant, pas de position, pas de
`snapshot_id`, et **aucun doublon strict possible**.

La **qualification** (`/api/qualification/*`) trie les likés vers les
playlists. Sa mémoire est persistée sur disque (volume `overtify-data`),
contrairement aux sessions qui restent en mémoire.

La **bibliothèque** (`/api/library`) indexe « quel morceau est où ». Coûteuse à
construire (~25 requêtes), elle est mise en cache et invalidée après chaque
mutation réussie. **L'invalidation est portée par les fonctions de mutation
elles-mêmes** (`addTracksToPlaylist`, `removeTracksFromPlaylist`,
`addLikedSongs`, `removeLikedSongs`, `syncTrackMembership`) : une nouvelle
route mutante hérite donc du comportement sans rien à retenir.

Côté frontend, le pendant est `useInvalidateLibraryData()` : toutes les
mutations passent par lui plutôt que d'énumérer les clés à invalider.

Hors périmètre : lecture audio, recommandations, statistiques d'écoute — les
endpoints correspondants sont fermés aux applications récentes.

---

## Style

TypeScript strict, pas de `any`. Commentaires en français, expliquant le
*pourquoi* — les contraintes d'API, les pièges — jamais le *quoi*. Nommage
explicite, fonctions courtes, composants découplés de la logique métier.
