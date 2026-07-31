# Stratégie de test

Trois niveaux, avec des rôles distincts. Le troisième existe à cause d'un
incident réel : Spotify a remplacé un endpoint sans que rien ne le détecte.

---

## Vue d'ensemble

| Niveau | Commande | Réseau | Ce qu'il protège |
|---|---|:---:|---|
| Unitaire | `make test` | non | La logique métier : normalisation, détection de doublons, sélection. |
| Bout en bout | `make test-e2e` | non | Les parcours complets à travers l'application, avec un Spotify simulé. |
| Contrat | `make test-contract` | **oui** | Que l'API Spotify réelle n'a pas changé sous nos pieds. |

`make test` exécute les deux premiers : ils sont déterministes et ne dépendent
d'aucun service externe.

---

## Tests unitaires

Portent sur les fonctions pures, principalement le dédoublonnage
([`frontend/src/services/duplicates/`](../frontend/src/services/duplicates/)).

Ces fonctions ne dépendent ni de React ni du réseau, ce qui permet de couvrir
les cas limites — variantes `live` à ne pas fusionner, chevauchement entre
doublons stricts et probables, cohérence position ↔ URI — en quelques
millisecondes.

Côté backend, ils couvrent les règles sensibles : garde de propriété, ordre
décroissant des suppressions, transmission du `snapshot_id`.

---

## Tests de bout en bout

[`backend/src/e2e/flows.e2e.test.ts`](../backend/src/e2e/flows.e2e.test.ts)

L'application Fastify complète est montée — routes, plugins, sessions, client
HTTP — et interrogée comme le ferait le navigateur. Seule l'API Spotify est
simulée, par [`spotifyMock.ts`](../backend/src/test/spotifyMock.ts).

Parcours couverts :

- **Authentification** : redirection avec les bons scopes, rejet d'un `state`
  falsifié, création de session, déconnexion.
- **Consultation** : filtrage sur les playlists possédées, compteur de morceaux,
  positions, refus sur une playlist tierce.
- **Ajout** : recherche puis ajout, vérification que le morceau est réellement
  présent, rejet d'un URI invalide.
- **Suppression** : retrait d'une occurrence précise sans toucher aux jumelles,
  transmission du `snapshot_id`, rejet des positions en double.
- **Dédoublonnage** : parcours complet, du chargement à la vérification du
  résultat.

### Pourquoi le simulateur reproduit les erreurs

Le simulateur renvoie **403 sur l'ancien chemin `/playlists/{id}/tracks`**,
comme le fait Spotify depuis février 2026.

C'est délibéré : un simulateur trop complaisant valide du code qui échoue en
production. Vérification faite — en réintroduisant l'ancien endpoint, **7 tests
échouent immédiatement**, dont ceux du dédoublonnage.

### Une subtilité technique

Le `fetch` global de Node embarque sa propre copie d'undici, insensible à
`setGlobalDispatcher`. Les appels sortants passent donc par
[`httpClient.ts`](../backend/src/utils/httpClient.ts), une indirection minimale
que les tests remplacent. Le code de production reste écrit avec `fetch`
standard.

---

## Test de contrat

[`backend/src/e2e/spotifyContract.test.ts`](../backend/src/e2e/spotifyContract.test.ts)

```bash
make test-contract    # nécessite .env et une connexion réseau
```

Interroge la **vraie** API Spotify pour vérifier que chaque endpoint utilisé
répond toujours.

### Le problème qu'il résout

Un test simulé reproduit l'API **telle qu'on la croit**, pas telle qu'elle est.
Quand Spotify a remplacé `/playlists/{id}/tracks` par `/playlists/{id}/items` le
11 février 2026, aucun test ne pouvait le voir : le simulateur répondait
sagement sur l'ancien chemin. Seule l'utilisation réelle a révélé le 403.

Ce test comble ce trou. Il est exclu de `make test` car il dépend du réseau —
un build hors ligne ne doit pas échouer pour autant.

### Lecture des statuts

- **200** ou **401** → l'endpoint existe. Le 401 signifie « token utilisateur
  requis », ce que ce test ne fournit pas : c'est un succès.
- **403** ou **404** → accès retiré. C'est le signal d'alarme.

En cas d'échec sur `/items`, le point de correction est unique :
`playlistItemsPath()` dans
[`config/spotify.ts`](../backend/src/config/spotify.ts).

---

## Journal des échanges Spotify

Complément indispensable aux tests : il montre ce que Spotify renvoie
**réellement**, ce qu'aucun simulateur ne peut garantir.

```bash
make logs-api          # suivi en direct
make logs-api-pretty   # dernier échange, formaté
```

Activation via `SPOTIFY_LOG_FILE` dans `.env` (vide par défaut). Les jetons,
codes OAuth et secrets sont masqués, les corps volumineux tronqués, et `logs/`
est ignoré par Git.

C'est ce journal qui a permis d'identifier la cause exacte du 403, là où le
message d'erreur générique de Spotify (« Forbidden ») n'apprenait rien.

---

## En cas de bug

1. **Reproduire dans un test** avant de corriger. Un correctif sans test
   reproduisant le problème ne garantit rien.
2. **Vérifier que le test échoue** sur le code non corrigé — sinon il ne
   protège de rien.
3. Si la cause vient de l'API Spotify, consulter `make logs-api` : la réponse
   brute y figure.
4. Si un endpoint a changé, ajouter le cas au test de contrat.

Cette discipline a été appliquée aux deux incidents rencontrés : le champ
`items` vs `tracks`, et la migration d'endpoint. Les deux sont désormais
couverts par des tests qui échouent si la régression revient.
