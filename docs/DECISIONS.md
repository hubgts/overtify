# Journal des décisions

Registre des choix structurants d'Overtify — métier et technique — avec leur
motif et les options écartées.

**Pourquoi ce fichier.** Les autres documents décrivent *comment* le projet
fonctionne ; celui-ci retient *pourquoi il fonctionne ainsi*. C'est ce qui
évite de refaire un débat déjà tranché, ou de « corriger » un comportement
volontaire.

**Comment le tenir à jour.** Une entrée par décision non évidente : ajouter en
bas, ne pas réécrire l'historique. Une décision annulée passe en *Révisée*, avec
un renvoi vers celle qui la remplace. Les micro-choix évidents n'ont pas leur
place ici — seulement ce qu'un nouveau venu risquerait de défaire par erreur.

**Format.** Contexte → Décision → Motif → Écarté → Conséquences.

| # | Décision | Type | Statut |
|---|---|---|---|
| [1](#1--authorization-code-flow-plutôt-que-pkce) | Authorization Code plutôt que PKCE | Technique | Adoptée |
| [2](#2--sessions-en-mémoire-mono-instance) | Sessions en mémoire | Technique | Adoptée |
| [3](#3--seules-les-playlists-possédées-sont-gérées) | Playlists possédées uniquement | Métier | Adoptée |
| [4](#4--deux-niveaux-de-doublons-jamais-un-seul) | Deux niveaux de doublons | Métier | Adoptée |
| [5](#5--aucune-suppression-sans-validation-explicite) | Aucune suppression automatique | Métier | Adoptée |
| [6](#6--normalisation-conservatrice-live-acoustic-remix-préservés) | Normalisation conservatrice | Métier | Adoptée |
| [7](#7--suppression-par-position-et-par-ordre-décroissant) | Suppression par position décroissante | Technique | Adoptée |
| [8](#8--rechargement-après-mutation-plutôt-que-mise-à-jour-optimiste) | Rechargement après mutation | Technique | Adoptée |
| [9](#9--dto-dupliqués-entre-backend-et-frontend) | DTO dupliqués | Technique | Adoptée |
| [10](#10--détection-de-doublons-côté-frontend-en-fonctions-pures) | Détection côté frontend, pure | Technique | Adoptée |
| [11](#11--couleur-daccent-centralisée-en-une-variable) | Accent centralisé | Technique | Adoptée |
| [12](#12--chemins-spotify-centralisés-et-lecture-tolérante) | Chemins Spotify centralisés | Technique | Adoptée |
| [13](#13--journal-des-échanges-spotify) | Journal des échanges API | Technique | Adoptée |
| [14](#14--trois-niveaux-de-tests-dont-un-contre-la-vraie-api) | Trois niveaux de tests | Technique | Adoptée |
| [15](#15--le-simulateur-reproduit-les-erreurs-réelles) | Simulateur fidèle aux erreurs | Technique | Adoptée |
| [16](#16--titres-likés-traités-comme-une-pseudo-playlist) | Titres likés en pseudo-playlist | Métier | Adoptée |
| [17](#17--résolution-dimage-choisie-selon-la-taille-daffichage) | Résolution d'image par usage | Technique | Adoptée |
| [18](#18--repli-silencieux-proscrit-sur-les-champs-structurants) | Pas de repli silencieux | Technique | Adoptée |

---

## 1 — Authorization Code Flow plutôt que PKCE

**Type :** technique · **Statut :** adoptée

**Contexte.** Spotify propose deux flux utilisables : PKCE (sans secret, tout
côté navigateur) ou Authorization Code classique (secret côté serveur).

**Décision.** Authorization Code classique. Le `client_secret` reste sur le
backend, le navigateur ne détient qu'un identifiant de session opaque dans un
cookie `httpOnly`.

**Motif.** Un backend était de toute façon nécessaire. PKCE aurait alors imposé
de stocker l'`access_token` dans le navigateur : une faille XSS, dans notre code
ou dans une dépendance, suffirait à l'exfiltrer. Ici, il n'y a rien à voler.

**Écarté.** PKCE — pertinent pour une application *purement* front, sans serveur.

**Conséquences.** Tous les appels Spotify transitent par le backend. La session
est révocable côté serveur.

---

## 2 — Sessions en mémoire, mono-instance

**Type :** technique · **Statut :** adoptée

**Contexte.** Il faut conserver les jetons Spotify entre deux requêtes.

**Décision.** Une `Map` en mémoire dans le backend.

**Motif.** Outil personnel mono-instance. Ajouter Redis alourdirait le
`docker-compose` et le `Makefile` pour un bénéfice nul à cette échelle.

**Écarté.** Redis (un service de plus) ; jetons chiffrés dans le cookie
(stateless mais non révocable, et cookie plus lourd).

**Conséquences.** Redémarrer le backend déconnecte les utilisateurs — assumé et
documenté. `InMemorySessionStore` expose une interface minimale
(`create`/`get`/`updateTokens`/`destroy`) : un store Redis s'y substituerait
sans toucher au reste.

---

## 3 — Seules les playlists possédées sont gérées

**Type :** métier · **Statut :** adoptée

**Contexte.** `/me/playlists` renvoie aussi les playlists suivies, non
modifiables.

**Décision.** Filtrage sur `owner.id === userId` à la lecture, vérification de
propriété avant toute écriture. Les playlists suivies n'apparaissent pas.

**Motif.** Spotify refuserait l'écriture de toute façon. Filtrer en amont donne
une interface honnête — pas de boutons grisés, pas d'échec après coup.

**Écarté.** Les afficher en lecture seule — plus permissif, mais une interface
pleine d'actions inertes.

**Conséquences.** Une playlist dont le propriétaire est indéterminable est
**refusée** par défaut, jamais autorisée.

---

## 4 — Deux niveaux de doublons, jamais un seul

**Type :** métier · **Statut :** adoptée

**Contexte.** Spotify ne détecte que le même enregistrement ajouté deux fois.
L'essentiel des doublons réels sont des rééditions : remaster, version single,
album deluxe.

**Décision.** Deux catégories distinctes — *identiques* (même `uri`, certitude
absolue) et *probables* (titre + artiste principal identiques après
normalisation, `uri` différents).

**Motif.** Les deux n'engagent pas le même risque. Les confondre imposerait
soit de tout traiter comme certain (suppressions erronées), soit de tout traiter
comme douteux (l'évidence noyée dans le bruit).

**Conséquences.** Les identiques sont pré-cochés, les probables non. Un groupe
« probable » n'inclut jamais une occurrence déjà couverte par un groupe
identique, sinon le même morceau apparaîtrait deux fois.

---

## 5 — Aucune suppression sans validation explicite

**Type :** métier · **Statut :** adoptée

**Contexte.** La demande initiale prévoyait la suppression *automatique* des
doublons stricts.

**Décision.** Tout passe par la modale. Les doublons stricts y sont
pré-sélectionnés, les probables décochés ; rien n'est envoyé à Spotify avant
confirmation.

**Motif.** Une suppression est irréversible côté playlist. La pré-sélection
préserve la rapidité — un clic suffit — sans retirer la visibilité sur ce qui va
disparaître.

**Écarté.** Suppression automatique des stricts : gain d'un clic contre une
perte totale de contrôle.

**Conséquences.** Un avertissement rouge signale tout morceau qui disparaîtrait
*entièrement* de la playlist. C'est permis, jamais silencieux.

---

## 6 — Normalisation conservatrice : `live`, `acoustic`, `remix` préservés

**Type :** métier · **Statut :** adoptée

**Contexte.** La normalisation doit rapprocher `Bohemian Rhapsody` de
`Bohemian Rhapsody - Remastered 2011`, sans confondre un studio et un live.

**Décision.** Seules les mentions **éditoriales** sont retirées (remaster,
radio edit, deluxe, explicit…). Celles qui désignent un enregistrement
réellement différent sont conservées.

**Motif.** Principe directeur : **un faux positif coûte plus cher qu'un doublon
manqué.** Rater un doublon est un désagrément ; proposer de supprimer une
version délibérément ajoutée détruit une intention.

**Écarté.** Distance de Levenshtein pour tolérer les fautes de frappe — gain
marginal, risque de faux positifs élevé.

**Conséquences.** Liste déclarative `EDITORIAL_MARKERS` : ajouter une règle,
c'est ajouter une ligne. Les mentions préservées sont couvertes par des tests
qui échouent si une future règle les fusionne.

---

## 7 — Suppression par position, et par ordre décroissant

**Type :** technique · **Statut :** adoptée

**Contexte.** Spotify accepte la suppression par `uri` seul — qui retire
**toutes** les occurrences — ou par `(uri, positions)`.

**Décision.** Toujours `(uri, positions)`, avec tri par positions
**décroissantes** et transmission du `snapshot_id`.

**Motif.** L'`uri` seul détruirait l'objet même du dédoublonnage, qui est d'en
conserver une. Le tri décroissant évite que la suppression d'une position ne
décale les suivantes. Le `snapshot_id` fait rejeter l'opération si la playlist a
bougé entre-temps.

**Conséquences.** Verrouillé par des tests. Ne s'applique pas aux Titres likés
(cf. décision 16), qui n'ont pas de position.

---

## 8 — Rechargement après mutation plutôt que mise à jour optimiste

**Type :** technique · **Statut :** adoptée

**Contexte.** Après un ajout ou une suppression, le cache doit refléter le
nouvel état.

**Décision.** Invalidation et rechargement depuis Spotify.

**Motif.** Les positions sont la clé des suppressions. Un cache désynchronisé
ferait supprimer le mauvais morceau. La correction prime sur la fluidité.

**Écarté.** Mise à jour optimiste — plus fluide, mais risque inacceptable ici.

---

## 9 — DTO dupliqués entre backend et frontend

**Type :** technique · **Statut :** adoptée

**Contexte.** Le contrat d'API doit être typé des deux côtés.

**Décision.** Deux fichiers jumeaux : `backend/src/types/dto.ts` et
`frontend/src/types/api.ts`.

**Motif.** Garde deux projets npm indépendants — deux images Docker, deux
installations — sans introduire de workspace ni d'outil de monorepo pour deux
fichiers.

**Écarté.** Package partagé (`packages/shared-types`) : justifié si le projet
grossit, disproportionné aujourd'hui.

**Conséquences.** **Toute modification doit être reportée des deux côtés.**

---

## 10 — Détection de doublons côté frontend, en fonctions pures

**Type :** technique · **Statut :** adoptée

**Contexte.** La détection pouvait vivre côté serveur ou client.

**Décision.** Côté frontend, dans `services/duplicates/`, sans dépendance à
React ni au réseau.

**Motif.** Testabilité : une fonction `PlaylistTrackDto[] → DuplicateReport` se
couvre en quelques millisecondes, sans monter de composant ni simuler de
serveur. L'utilisateur ajuste sa sélection sans aller-retour réseau.

**Conséquences.** Toute la playlist doit être chargée avant analyse — environ
40 requêtes pour 2 000 titres.

---

## 11 — Couleur d'accent centralisée en une variable

**Type :** technique · **Statut :** adoptée

**Décision.** Toutes les couleurs dans le bloc `@theme` de `theme.css`.
Changer `--color-accent` repeint l'application.

**Motif.** Exigence explicite du projet. Aucune couleur codée en dur dans les
composants.

**Conséquences.** Un accent clair impose d'ajuster `--color-accent-contrast`
pour la lisibilité du texte posé dessus.

---

## 12 — Chemins Spotify centralisés et lecture tolérante

**Type :** technique · **Statut :** adoptée

**Contexte.** Spotify a cassé Overtify deux fois pendant son développement :

| Date | Changement | Effet |
|---|---|---|
| avril 2025 | `localhost` interdit en Redirect URI | Application non enregistrable |
| 11 février 2026 | `/playlists/{id}/tracks` → `/items` | 403 sur tout affichage |

S'y ajoutent deux divergences entre documentation et réalité : le compteur de
morceaux arrive sous `items` et non `tracks` ; la piste est imbriquée sous
`item`, `track` étant déprécié.

**Décision.** Chemins dans une fonction dédiée (`playlistItemsPath()`), et
lecture des formes connues plutôt que d'une seule supposée (`extractTrackCount`,
`extractTrack`).

**Motif.** Une migration future ne doit toucher qu'un seul endroit. La
documentation Spotify n'est pas fiable ; seule la réponse réelle l'est.

**Conséquences.** Chaque divergence rencontrée est couverte par un test de
régression.

---

## 13 — Journal des échanges Spotify

**Type :** technique · **Statut :** adoptée

**Contexte.** Le message d'erreur de Spotify (« Forbidden ») n'indique ni la
cause ni l'endpoint fautif.

**Décision.** Journal optionnel des requêtes et réponses brutes, activé par
`SPOTIFY_LOG_FILE`. Jetons et secrets masqués, corps tronqués, `logs/` ignoré
par Git.

**Motif.** C'est ce journal qui a identifié la migration d'endpoint en une
lecture, après deux hypothèses erronées.

**Conséquences.** Désactivé par défaut. `make logs-api` pour le suivi.

---

## 14 — Trois niveaux de tests, dont un contre la vraie API

**Type :** technique · **Statut :** adoptée

**Contexte.** Le retrait de `/tracks` par Spotify n'a été découvert qu'à
l'usage : aucun test ne pouvait le voir.

**Décision.** Unitaire (logique pure) · bout en bout (parcours complets, Spotify
simulé) · **contrat** (vraie API, hors suite par défaut).

**Motif.** Un test simulé reproduit l'API *telle qu'on la croit*. Seul un appel
réel détecte qu'elle a changé.

**Conséquences.** `make test` reste hors ligne et déterministe ;
`make test-contract` demande réseau et identifiants.

---

## 15 — Le simulateur reproduit les erreurs réelles

**Type :** technique · **Statut :** adoptée

**Contexte.** Un simulateur complaisant valide du code qui échoue en
production — erreur commise une fois : le simulateur répondait sur l'ancien
endpoint et au format déprécié, donc les tests passaient sur du code cassé.

**Décision.** Le simulateur renvoie **403 sur l'endpoint retiré** et n'utilise
que le format courant (`item`, pas `track`).

**Motif.** Sa valeur tient entièrement à sa fidélité.

**Conséquences.** Vérifié en réintroduisant chaque bug : 7 tests échouent sur
l'endpoint obsolète, 5 sur le mauvais format. Un correctif doit toujours
s'accompagner d'un test dont on a **vérifié qu'il échoue** sans lui.

---

## 16 — Titres likés traités comme une pseudo-playlist

**Type :** métier · **Statut :** adoptée

**Contexte.** Les Titres likés ne sont pas une playlist chez Spotify :
endpoints, scopes et sémantique distincts.

**Décision.** Présentés comme une playlist dans l'interface, avec l'identifiant
réservé `liked-songs` ; le backend route vers `/me/tracks` via un service dédié.

**Motif.** L'utilisateur les perçoit comme une playlist. Le contrat d'API reste
unique, les composants sont réutilisés tels quels.

**Écarté.** Une section et des routes séparées — duplication d'interface pour
un objet perçu comme identique.

**Conséquences.**

| | Playlists | Titres likés |
|---|---|---|
| Suppression | par position | par identifiant |
| `snapshot_id` | oui | aucun (chaîne vide acceptée) |
| Doublons stricts | possibles | **impossibles** (unicité garantie) |

L'unicité rend le dédoublonnage *probable* particulièrement utile ici : c'est le
seul type de doublon possible, et Spotify ne le signale jamais.

L'identifiant contient un tiret, ce qui exclut toute collision avec un
identifiant Spotify (22 caractères base62).

---

## 17 — Résolution d'image choisie selon la taille d'affichage

**Type :** technique · **Statut :** adoptée

**Contexte.** Spotify fournit plusieurs résolutions. Prendre systématiquement la
plus petite affichait une image de 64 px sur une pochette de 160 px —
visiblement floue.

**Décision.** Retenir la plus petite image au moins aussi grande que la zone
d'affichage, avec doublement pour les écrans haute densité. Tailles déclarées
dans `DISPLAY_SIZES`.

**Motif.** L'économie de bande passante ne justifie pas une image floue.

**Conséquences.** `DISPLAY_SIZES` doit rester aligné sur les classes CSS des
composants : une valeur trop basse redonnerait du flou.

---

## 18 — Repli silencieux proscrit sur les champs structurants

**Type :** technique · **Statut :** adoptée

**Contexte.** Face à un crash sur un champ absent, la réaction a été d'ajouter
des `?? 0` et `?? null` partout. Résultat : le crash a disparu, remplacé par
« 0 morceau » affiché sur toutes les playlists. Un bug visible était devenu un
bug silencieux.

**Décision.** Le repli est réservé aux champs **décoratifs** (pochette,
description). Pour un champ **structurant** — compteur, propriétaire, piste —
il faut comprendre pourquoi il manque et lire la forme réelle de la réponse.

**Motif.** Un repli masque le symptôme sans traiter la cause, et retarde le
diagnostic en donnant l'illusion que ça fonctionne.

**Conséquences.** `extractTrackCount()` et `extractTrack()` lisent les formes
connues de l'API au lieu de se rabattre sur une valeur par défaut. Une playlist
sans propriétaire identifiable est refusée, jamais traitée comme accessible.

---

## 19 — Qualification des likés : non destructive

**Type :** métier · **Statut :** adoptée

**Contexte.** Les Titres likés s'accumulent sans organisation ; Spotify n'offre
aucun moyen de les ranger autrement qu'un par un, manuellement.

**Décision.** Une page dédiée présente un titre liké à la fois. L'utilisateur
coche une ou plusieurs playlists de destination, valide, et passe au suivant.
Le titre est **ajouté** aux playlists choisies mais **reste dans les likés**.

**Motif.** Les likés constituent la collection de référence — ce que
l'utilisateur a aimé. Les playlists en sont des vues thématiques. Vider les
likés au fur et à mesure détruirait cette collection, de façon irréversible.

**Écarté.** Retrait automatique des likés après rangement : vide la file plus
vite, mais destructif et impossible à annuler.

**Conséquences.** Le bouton « Passer » est une décision à part entière — « ce
titre reste simplement dans mes likés » — et marque le titre traité. C'est ce
qui permet à la file de se vider réellement.

---

## 20 — Persistance sur fichier JSON pour la qualification

**Type :** technique · **Statut :** adoptée

**Contexte.** Le tri de plusieurs centaines de titres s'étale sur plusieurs
séances. La mémoire des titres traités doit survivre aux redémarrages — ce que
les sessions en mémoire (décision n°2) ne permettent pas.

**Décision.** Un fichier JSON par utilisateur, dans un volume Docker nommé.
Écriture atomique (fichier temporaire puis renommage), cache mémoire en lecture.

**Motif.** Volume de données modeste — quelques milliers d'URI. Aucune
dépendance, aucun schéma à migrer. L'écriture atomique évite qu'une coupure ne
laisse un JSON tronqué.

**Écarté.** `localStorage` (perdu au changement de navigateur ou d'appareil) ;
SQLite (justifié si des requêtes croisées deviennent nécessaires).

**Conséquences.** Cette décision **fait évoluer la n°2** : le projet persiste
désormais des données applicatives, mais toujours pas les sessions. Le store
expose `clearCache()` pour que les tests vérifient la persistance réelle et non
le seul cache mémoire — sans quoi le test passerait même sans écriture disque,
piège effectivement rencontré et corrigé.

---

## 21 — Appartenance pré-cochée, mais jamais réajoutée

**Type :** métier · **Statut :** adoptée

**Contexte.** Lors de la qualification, l'utilisateur ne voit pas si le titre
affiché figure déjà dans certaines de ses playlists. Il risque donc de le
ranger là où il se trouve déjà.

**Décision.** Les playlists contenant déjà le titre sont **pré-cochées** et
signalées en vert (« Déjà présent »). Valider ne provoque **aucun réajout** :
le serveur vérifie l'appartenance réelle avant chaque ajout.

**Motif.** Pré-cocher informe et évite de re-sélectionner ce qui est déjà fait.
Mais une case cochée signifie normalement « ajouter » — sans garde-fou, valider
créerait un doublon strict, précisément ce que l'application sert à éliminer.
La vérification est faite **côté serveur** : le client peut se tromper ou être
désynchronisé, la garantie ne doit pas dépendre de lui.

**Écarté.** Cases désactivées pour les playlists déjà contenantes — empêcherait
de les décocher, et ne dit pas clairement pourquoi. Ne rien afficher — laisse
l'utilisateur créer des doublons à l'aveugle.

**Conséquences.**

- Le compteur du bouton reflète les **ajouts réels**, pas les cases cochées :
  tout re-cocher n'active pas le bouton.
- `QualifyResultDto` distingue `addedTo` (ajouté) de `skipped` (déjà présent).
- Coût : le contenu de toutes les playlists est chargé à l'ouverture de la file
  (~15 appels pour 11 playlists), une seule fois et non par titre. Une playlist
  illisible est ignorée plutôt que de faire échouer la file entière.

---

## 22 — Index de bibliothèque mis en cache et invalidé aux mutations

**Type :** technique · **Statut :** adoptée

**Contexte.** Répondre à « où est ce morceau ? » impose de connaître le contenu
de toutes les playlists : environ 25 requêtes Spotify et quelques secondes pour
une bibliothèque de 11 playlists. Le refaire à chaque navigation serait
inutilisable.

**Décision.** Un index unique (`libraryIndexService`), conservé en mémoire par
utilisateur et **invalidé explicitement après chaque mutation réussie** —
ajout, suppression, qualification.

**Motif.** Overtify sait exactement quand la bibliothèque change, puisque c'est
lui qui la modifie. Une expiration par minuterie servirait soit des données
périmées, soit des reconstructions inutiles. L'invalidation est placée **après**
le succès de la mutation : une opération échouée n'a rien changé, et vider le
cache pour rien coûterait une réindexation.

**Écarté.** Rechargement systématique (plusieurs secondes à chaque visite) ;
cache persisté sur disque (risque accru de données périmées).

**Conséquences.**

- La qualification réutilise cet index au lieu d'en construire un second : elle
  reconstruisait auparavant sa propre carte d'appartenance à chaque ouverture.
- **L'invalidation appartient aux mutations, pas à leurs appelants.** Elle était
  d'abord répétée dans les quatre routes mutantes : l'invariant tenait alors à
  la vigilance du prochain auteur de route, sans que le typage ne l'exige. Les
  cinq fonctions de mutation l'assurent désormais elles-mêmes, ce qui rend une
  nouvelle mutation correcte par défaut.
- L'index en cache sert aussi à **éviter des rechargements** : `qualifyTrack` et
  `syncTrackMembership` y lisent l'appartenance au lieu de recharger chaque
  playlist concernée. Le détail n'est relu que pour les playlists réellement
  modifiées, où la fraîcheur des positions est indispensable.
- Une modification faite depuis l'application Spotify officielle n'est pas
  détectée — d'où le bouton « Actualiser » et un plafond de fraîcheur de
  15 minutes en dernier recours.
- Le cache étant un singleton, les tests doivent le purger entre les cas :
  omission effectivement rencontrée, un test échouait à cause de l'état laissé
  par le précédent.

---

## 23 — Vue bibliothèque factuelle : une ligne par enregistrement

**Type :** métier · **Statut :** adoptée

**Contexte.** Spotify cloisonne playlists et titres likés. Impossible d'y
savoir dans quelles playlists figure un morceau, ni lesquels ne sont rangés
nulle part.

**Décision.** Une vue listant chaque enregistrement distinct avec **tous** ses
emplacements. Deux éditions d'un même titre (original et remaster) restent
**deux lignes distinctes**.

**Motif.** Cette vue doit être **factuelle** : ce qui est affiché correspond
exactement à ce qui existe. Regrouper les éditions supposerait la normalisation
du dédoublonnage — une heuristique, légitime là où l'utilisateur arbitre, mais
déplacée dans une vue d'inventaire.

**Écarté.** Regroupement par titre normalisé (introduit une approximation) ;
lignes distinctes avec indicateur d'édition voisine (mêmes réserves, complexité
supplémentaire).

**Conséquences.** Quatre filtres répondent aux questions réelles : tous, dans
plusieurs playlists, likés non rangés, en playlist non likés. Le filtrage et le
tri sont **locaux** — l'index est chargé une fois, tout le reste est instantané
et testable comme fonctions pures.

---

## 24 — Scopes réduits au strict nécessaire

**Type :** technique · **Statut :** adoptée

**Contexte.** L'écran de consentement Spotify — hébergé par Spotify, donc non
personnalisable — liste tout ce que l'application demande. Overtify réclamait
`user-read-email` et `user-read-private`, hérités du premier jet.

**Décision.** Ces deux scopes sont retirés. Il en reste cinq, tous utilisés :
lecture et modification des playlists, lecture et modification des likés.

**Motif.** Vérification faite dans le code : l'adresse e-mail n'est jamais lue,
et `user-read-private` ne débloque que `country`, `product`, `followers` et
`explicit_content`, dont aucun n'est consommé. Le profil affiché (nom, avatar)
provient des champs publics de `/me`. Ces scopes n'apportaient donc rien, tout
en allongeant l'écran de consentement et en élargissant les droits accordés.

**Conséquences.**

- La ligne « Votre adresse e-mail » disparaît du consentement.
- Le champ `email` est retiré du type `SpotifyUser`.
- Un test vérifie la liste exacte des scopes **et** l'absence des superflus :
  sans lui, rien n'empêcherait d'en réintroduire un sans usage.
- Les sessions ouvertes avec les anciens scopes restent valides ; la réduction
  ne prend effet qu'à la prochaine connexion.

---

## 25 — Ajout depuis la bibliothèque : ajout seul, sans marquage

**Type :** métier · **Statut :** **révisée** — remplacée par la
[décision 26](#26--gestion-complète-de-lappartenance-avec-périmètre-explicite),
qui autorise aussi le retrait, encadré par un récapitulatif obligatoire.

**Contexte.** La vue bibliothèque montre où se trouve chaque morceau. Voir
qu'un titre manque dans une playlist sans pouvoir l'y ajouter obligeait à
repasser par Spotify.

**Décision.** Un bouton par ligne ouvre une modale de destinations. L'action
**ajoute uniquement** : décocher une playlist contenante ne retire rien, et les
playlists déjà contenantes sont verrouillées.

**Motif.** Rendre une suppression déclenchable d'un clic depuis une vue
d'inventaire irait contre la règle « aucune suppression sans validation
explicite » (décision n°5). Le retrait a sa place dans la vue de playlist, où
le geste est délibéré.

**Écarté.** Ajout et retrait par simple case (trop facile à déclencher par
mégarde) ; retrait avec confirmation séparée (alourdit une modale qui doit
rester rapide).

**Conséquences.**

- Route dédiée `/api/library/add` plutôt que réutilisation de la
  qualification : celle-ci **marque le titre comme trié**, ce qui polluerait la
  progression du tri des likés pour une action ponctuelle. Un test vérifie que
  la file de qualification reste inchangée.
- La garde anti-doublon de la décision n°21 s'applique : l'appartenance est
  vérifiée côté serveur avant chaque ajout.
- `PlaylistPicker` gagne un mode `lockAlreadyIn` : la qualification pré-coche
  les playlists contenantes pour informer, la bibliothèque les verrouille
  puisqu'elles ne sont pas des destinations valides.
- L'index est invalidé après l'ajout, sinon la vue afficherait les emplacements
  d'avant.

---

## 26 — Gestion complète de l'appartenance, avec périmètre explicite

**Type :** métier · **Statut :** adoptée · **Remplace** la décision 25

**Contexte.** La modale de la bibliothèque ne permettait que l'ajout. Retirer
un morceau d'une playlist obligeait à ouvrir cette playlist, alors même que la
vue affiche déjà tous ses emplacements.

**Décision.** Les cases reflètent l'appartenance **réelle** : cocher ajoute,
décocher retire. Un **récapitulatif** énonce les changements avant validation,
les retraits étant signalés en rouge et qualifiés de définitifs.

**Motif.** La décision 25 écartait le retrait par crainte d'un clic malheureux.
Le récapitulatif lève cette objection : rien n'est appliqué sans que
l'utilisateur ait lu ce qui va changer, ce qui respecte la règle « aucune
suppression sans validation explicite » (décision n°5) tout en évitant un
détour par une autre page.

**Écarté.** Confirmation séparée pour les retraits (deux étapes pour une
opération mixte) ; croix sur chaque pastille de playlist (suppression immédiate
au moindre clic).

**Conséquences.**

- **Périmètre explicite et obligatoire.** Le client envoie l'état voulu *et* la
  liste des playlists concernées. Sans ce périmètre, une playlist simplement
  absente de la liste — parce que non chargée, par exemple — serait interprétée
  comme un retrait. Un test vérifie qu'une playlist hors périmètre reste
  intacte.
- **Positions relues au moment du retrait**, jamais reprises du cache : elles
  pourraient être périmées, et supprimer une position obsolète retirerait le
  mauvais morceau.
- **Toutes les occurrences** d'un doublon sont retirées : en laisser une serait
  incohérent avec la vocation de l'application.
- L'opération ne marque pas le titre comme trié — la progression du tri des
  likés reste intacte.
- La route `/library/add` et son service sont supprimés, remplacés par
  `/library/sync` : pas de code mort laissé derrière.
