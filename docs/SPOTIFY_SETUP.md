# Créer votre application Spotify

Overtify a besoin de ses propres identifiants Spotify pour fonctionner. Cette
page décrit la procédure complète, du compte développeur au fichier `.env`
correctement rempli.

Durée : environ 5 minutes.

---

## 1. Accéder au Developer Dashboard

1. Ouvrez **<https://developer.spotify.com/dashboard>**.
2. Connectez-vous avec votre compte Spotify habituel (gratuit ou Premium, les
   deux conviennent).
3. À la première visite, Spotify demande d'accepter les *Developer Terms of
   Service*. Acceptez pour continuer.

---

## 2. Créer l'application

1. Cliquez sur **Create app**.
2. Renseignez le formulaire :

   | Champ | Valeur à saisir | Remarque |
   |---|---|---|
   | **App name** | `Overtify` | Libre. Ce nom apparaîtra sur l'écran de consentement. |
   | **App description** | `Gestion de mes playlists` | Libre. |
   | **Website** | *(vide)* | Facultatif. |
   | **Redirect URIs** | `http://127.0.0.1:8080/api/auth/callback` | **Critique** — voir ci-dessous. |
   | **Which API/SDKs are you planning to use?** | Cochez **Web API** uniquement | Overtify ne lit pas d'audio : le Web Playback SDK est inutile. |

3. Cliquez sur **Add** à droite du champ Redirect URIs. L'URI doit apparaître
   **listée sous le champ** ; si elle reste seulement dans la zone de saisie,
   elle ne sera pas enregistrée.
4. Ajoutez de la même façon la seconde URI, pour le mode développement :
   `http://127.0.0.1:3001/api/auth/callback`
5. Cochez la case des conditions, puis **Save**.

### Choisir la bonne Redirect URI

| Mode de lancement | Redirect URI à déclarer |
|---|---|
| Docker (`make up`) | `http://127.0.0.1:8080/api/auth/callback` |
| Développement local (`make dev`) | `http://127.0.0.1:3001/api/auth/callback` |

Déclarez **les deux** : vous pourrez alterner entre les modes sans revenir dans
le dashboard.

> ### `127.0.0.1`, surtout pas `localhost`
>
> Depuis avril 2025, Spotify **refuse `localhost`** dans les Redirect URIs et
> impose l'adresse de bouclage littérale. Saisir une URI en `localhost`
> affiche l'avertissement *« This redirect URI is not secure »* et bloque
> l'enregistrement.
>
> **Conséquence pratique :** ouvrez ensuite l'application sur
> **`http://127.0.0.1:8080`**, et non sur son équivalent en `localhost`. Les deux
> désignent votre machine, mais constituent des **origines distinctes** pour le
> navigateur : le cookie de session déposé sur l'une ne sera pas envoyé à
> l'autre, et vous paraîtrez déconnecté en boucle.
>
> Référence : [Spotify — Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)

> **Correspondance exacte.** L'URI déclarée ici et la valeur de
> `SPOTIFY_REDIRECT_URI` dans votre `.env` doivent être identiques caractère
> pour caractère. Un port différent, un `https` au lieu de `http` ou un `/`
> final en trop provoquent `INVALID_CLIENT: Invalid redirect URI`.

---

## 3. Récupérer les identifiants

1. Depuis la page de votre application, ouvrez **Settings** (en haut à droite).
2. Vous y trouvez :
   - **Client ID** : visible directement, copiez-le ;
   - **Client secret** : cliquez sur **View client secret** pour l'afficher.

> **Le Client Secret est un mot de passe.** Il ne doit jamais être committé ni
> transmis au navigateur. Dans Overtify, il reste exclusivement côté backend
> (voir [ARCHITECTURE.md](./ARCHITECTURE.md)). S'il fuite, régénérez-le depuis
> cette même page.

---

## 4. Renseigner le fichier `.env`

À la racine du projet, si ce n'est pas déjà fait :

```bash
make init
```

Cette commande crée `.env` à partir de `.env.example` et génère automatiquement
un `SESSION_SECRET` aléatoire.

Ouvrez ensuite `.env` et collez vos deux identifiants :

```dotenv
SPOTIFY_CLIENT_ID=collez_votre_client_id_ici
SPOTIFY_CLIENT_SECRET=collez_votre_client_secret_ici

# Doit correspondre exactement à l'URI déclarée dans le dashboard
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8080/api/auth/callback
FRONTEND_URL=http://127.0.0.1:8080

# Généré par `make init`
SESSION_SECRET=…
```

Pour le mode développement (`make dev`), utilisez plutôt :

```dotenv
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
FRONTEND_URL=http://127.0.0.1:5173
```

---

## 5. Ajouter votre compte à l'application

**Cette étape est indispensable et c'est l'oubli le plus fréquent.**

Une application fraîchement créée est en mode **Development**. Dans ce mode,
seuls les utilisateurs explicitement autorisés peuvent s'y connecter — même
vous, le propriétaire, dans certains cas. Un utilisateur non déclaré obtient
l'erreur `User not registered in the Developer Dashboard`.

1. Depuis votre application : **Settings** → onglet **User Management**.
2. Cliquez sur **Add user**.
3. Saisissez le **nom** et l'**adresse e-mail du compte Spotify** (celle du
   compte, pas une adresse arbitraire).
4. Validez.

La limite est de 5 utilisateurs en mode Development. Overtify étant un outil
personnel, c'est amplement suffisant : passer en mode Extended Quota
(soumission à Spotify pour revue) n'est pas nécessaire.

---

## 6. Lancer et vérifier

```bash
make up
```

Ouvrez <http://127.0.0.1:8080> et cliquez sur **Se connecter avec Spotify**.
Vous devriez voir l'écran de consentement Spotify listant les autorisations
demandées, puis revenir sur Overtify avec vos playlists affichées.

---

## Résolution des problèmes

| Message | Cause | Solution |
|---|---|---|
| `INVALID_CLIENT: Invalid redirect URI` | L'URI du `.env` ne correspond pas à celle du dashboard. | Comparez les deux caractère par caractère. Vérifiez que l'URI a bien été **ajoutée** à la liste (bouton *Add*) et pas seulement saisie. |
| `INVALID_CLIENT: Invalid client` | `SPOTIFY_CLIENT_ID` erroné ou vide. | Recopiez le Client ID depuis Settings. Vérifiez l'absence d'espace en fin de ligne. |
| `User not registered in the Developer Dashboard` | Compte non déclaré. | Étape 5 : ajoutez le compte dans *User Management*. |
| *« This redirect URI is not secure »* dans le dashboard | Vous avez saisi `localhost`. | Remplacez par `127.0.0.1` : Spotify n'accepte plus `localhost`. |
| Connexion réussie, mais l'application redemande aussitôt de se connecter | Vous avez ouvert `localhost:8080` alors que la session a été créée sur `127.0.0.1:8080`. | Ouvrez l'application sur **`http://127.0.0.1:8080`**. Ce sont deux origines distinctes : le cookie de session n'est pas partagé entre elles. |
| `invalid_client` lors de l'échange de token | `SPOTIFY_CLIENT_SECRET` erroné. | Réaffichez le secret via *View client secret* et recopiez-le. |
| La page reste bloquée sur « Connexion à Spotify… » | Backend injoignable. | `make logs-backend` pour lire l'erreur. Le plus souvent, une variable manquante dans `.env`. |
| Mes playlists n'apparaissent pas | Overtify n'affiche **que les playlists dont vous êtes propriétaire**. | C'est le comportement attendu : les playlists suivies ne sont pas gérables. Voir [DEDUPLICATION.md](./DEDUPLICATION.md). |
| « Action refusée » à l'ouverture d'une playlist qui vous appartient | Spotify a probablement retiré un endpoint utilisé par Overtify. | `make test-contract` identifie l'endpoint fautif. Consultez `make logs-api` pour la réponse brute. Voir [TESTS.md](./TESTS.md). |
| « Titres likés » absents ou en erreur après mise à jour | Les scopes `user-library-read` / `user-library-modify` ont été ajoutés ; votre session date d'avant. | Déconnectez-vous puis reconnectez-vous : Spotify redemandera votre accord avec les nouvelles autorisations. |
| « 0 morceau » sur toutes les playlists | Spotify a changé la forme de sa réponse. | `make logs-api-pretty` montre le corps réel. Le compteur est lu par `extractTrackCount()` dans `backend/src/services/mappers.ts`. |

Après toute modification du `.env`, redémarrez les conteneurs :

```bash
make restart
```
