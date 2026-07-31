# Le dédoublonnage

La fonctionnalité centrale d'Overtify. Ce document décrit ce qui est détecté,
comment, et pourquoi certaines choses le sont volontairement **pas**.

Code concerné : [`frontend/src/services/duplicates/`](../frontend/src/services/duplicates/)

---

## Le problème

Spotify ne détecte qu'un seul type de doublon : le même enregistrement ajouté
deux fois. Il vous avertit alors au moment de l'ajout.

Mais une playlist constituée sur plusieurs années accumule surtout des doublons
d'un autre genre :

```
Bohemian Rhapsody                      spotify:track:3z8h0T…
Bohemian Rhapsody - Remastered 2011    spotify:track:7tFiyT…
```

Deux `uri` différents, donc deux morceaux distincts pour Spotify. Pour vous,
c'est deux fois la même chanson. Ces doublons-là passent totalement sous le
radar, et ce sont les plus nombreux.

---

## Deux niveaux de détection

Overtify sépare ce qui est **certain** de ce qui est **probable**, car les deux
n'engagent pas le même risque.

### Doublons identiques

Même `uri` présent plusieurs fois. Aucune ambiguïté possible : c'est
rigoureusement le même enregistrement.

→ **Pré-cochés** dans la modale. Il n'y a rien à arbitrer.

### Doublons probables

Titre et artiste principal identiques **après normalisation**, mais `uri`
différents.

→ **Laissés décochés.** C'est une heuristique : elle peut se tromper, donc
elle ne décide jamais à votre place.

---

## La normalisation

Pour rapprocher deux libellés, on les réduit à une forme canonique.

Pipeline appliqué au titre, dans cet ordre
([`normalize.ts`](../frontend/src/services/duplicates/normalize.ts)) :

| Étape | Exemple |
|---|---|
| 1. Minuscules, accents retirés | `Björk — Jóga` → `bjork — joga` |
| 2. Mentions de featuring retirées | `Stay (feat. Justin Bieber)` → `stay` |
| 3. Segments éditoriaux entre parenthèses retirés | `Come Together (2019 Remaster)` → `come together` |
| 4. Suffixe éditorial après tiret retiré | `Creep - Radio Edit` → `creep` |
| 5. Ponctuation retirée, espaces normalisés | `Don't Stop Me Now!` → `dont stop me now` |

La clé de rapprochement est ensuite `titre normalisé :: artiste principal
normalisé`.

**Seul le premier artiste compte.** Les artistes secondaires varient trop d'une
édition à l'autre : `Stay` de The Kid LAROI apparaît tantôt avec Justin Bieber
crédité, tantôt sans.

### Mentions considérées comme éditoriales

`remaster` / `remastered` / `2019 remaster`, `radio edit`, `single version`,
`album version`, `original mix`, `deluxe edition`, `explicit`, `clean`, `mono`,
`stereo`, `1972 version`, `bonus track`, `from … soundtrack`.

La liste complète est déclarative, en tête de
[`normalize.ts`](../frontend/src/services/duplicates/normalize.ts) : ajouter une
règle consiste à ajouter une ligne au tableau `EDITORIAL_MARKERS`.

### Mentions volontairement préservées

`live`, `acoustic`, `remix`, et toute mention non listée.

Ces mots désignent un **enregistrement réellement différent**. Fusionner
`Creep` et `Creep (Live at Glastonbury)` proposerait de supprimer une version
que vous avez ajoutée délibérément.

> **Principe directeur : un faux positif coûte plus cher qu'un doublon manqué.**
> Rater un doublon est un désagrément ; proposer de supprimer le mauvais
> morceau détruit une intention de l'utilisateur. En cas de doute, Overtify
> ne propose rien.

---

## Le cas limite du chevauchement

Un morceau peut être **à la fois** répété à l'identique et présent dans une
autre édition :

```
position 0 : Creep              spotify:track:orig
position 1 : Creep              spotify:track:orig      ← doublon identique
position 2 : Creep - Remastered spotify:track:remaster  ← doublon probable
```

Sans précaution, la position 0 apparaîtrait dans les deux catégories et
l'utilisateur verrait le même morceau proposé deux fois.

Règle appliquée : les occurrences déjà couvertes par un groupe identique sont
**exclues** de l'analyse des probables. Seule la première occurrence de chaque
`uri` est présentée dans les groupes probables. Ce comportement est verrouillé
par un test dédié.

---

## Ce que voit l'utilisateur

La modale affiche, pour chaque groupe, **toutes** les occurrences avec leurs
différences (album, durée, position). Ce sont ces écarts qui permettent de
trancher.

Trois gestes possibles :

| Geste | Effet |
|---|---|
| Case à cocher | Marque une occurrence précise pour suppression. |
| « Garder celui-ci » | Marque toutes les autres du groupe. |
| « Tout (dé)sélectionner » | Applique à toute une catégorie. |

Un avertissement rouge apparaît si **toutes** les occurrences d'un groupe sont
cochées : le morceau disparaîtrait entièrement de la playlist. C'est autorisé —
c'est peut-être voulu — mais jamais silencieux.

Rien n'est envoyé à Spotify tant que le bouton de confirmation n'a pas été
actionné.

---

## Suppression : pourquoi les positions

Spotify propose deux façons de retirer un morceau :

```jsonc
// Retire TOUTES les occurrences — inutilisable ici
{ "tracks": [{ "uri": "spotify:track:abc" }] }

// Retire l'occurrence en position 4 — ce qu'utilise Overtify
{ "tracks": [{ "uri": "spotify:track:abc", "positions": [4] }] }
```

La première forme détruirait l'objet même du dédoublonnage, qui est de garder
une occurrence.

Deux précautions accompagnent l'envoi :

- **Tri par positions décroissantes.** Supprimer la position 1 décale toutes
  les suivantes ; en descendant, les positions restantes sont préservées.
- **`snapshot_id`.** Si la playlist a été modifiée ailleurs entre son
  chargement et la confirmation, Spotify rejette l'opération au lieu de
  supprimer au mauvais endroit.

---

## Le cas des Titres likés

Les « Titres likés » sont présentés comme une playlist, mais Spotify les traite
comme une collection à part (`/me/tracks`). Deux conséquences pour le
dédoublonnage :

- **Aucun doublon strict n'est possible.** Un morceau ne peut être liké qu'une
  fois ; l'API rejette silencieusement un second ajout du même identifiant.
  Seuls les doublons *probables* — un titre et son remaster, deux éditions
  d'un même album — peuvent s'y trouver.
- **La suppression se fait par identifiant**, sans notion de position ni de
  `snapshot_id`. L'interface reste identique, mais le backend traduit la
  sélection en liste d'identifiants (`likedSongsService.ts`).

C'est précisément là que le dédoublonnage « probable » d'Overtify est le plus
utile : Spotify n'avertit jamais qu'un titre déjà liké l'est à nouveau sous une
autre édition.

## Limites

| Limite | Raison |
|---|---|
| Titres locaux ignorés | L'API Spotify ne permet pas de les manipuler de façon fiable. |
| Titres traduits non rapprochés | `Je t'aime` et `I Love You` n'ont aucune parenté textuelle. |
| Reprises non détectées | Même titre, artiste différent : c'est un autre morceau. |
| Fautes de frappe non tolérées | Pas de distance de Levenshtein : le gain serait marginal face au risque de faux positifs. |
| Analyse côté client | Toute la playlist doit être chargée avant analyse. |

---

## Tests

La logique est couverte par des tests unitaires, exécutables en une demi-seconde :

```bash
cd frontend && npm test
```

| Fichier | Objet |
|---|---|
| `normalize.test.ts` | Chaque règle de normalisation, et les mentions à préserver. |
| `detectDuplicates.test.ts` | Regroupement, tri, chevauchement, titres locaux. |
| `selection.test.ts` | Sélection initiale, gestes utilisateur, cohérence position ↔ URI. |

Ces fonctions étant pures — aucune dépendance à React ni au réseau — elles se
testent directement, sans montage de composant ni serveur simulé.
