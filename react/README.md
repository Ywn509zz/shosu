# shOsu! — version React

Version React de shOsu! (bêta 1.5), construite **à partir de la version HTML/CSS/JS de ce dépôt**,
qui reste intacte à la racine. Le design est strictement le vôtre : la feuille de style
d'origine est reprise telle quelle et le balisage est le même.

| Besoin                    | Choix                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| Routing + rendu serveur   | [React Router 8](https://reactrouter.com) en *framework mode*         |
| Composants                | [HeroUI v3](https://www.heroui.com) (`Button`, `Input`) + Tailwind 4  |
| Authentification          | [Better Auth](https://www.better-auth.com), connexion via osu! (OAuth) |

## Démarrage

Prérequis : Node.js 24 (celui de Vercel ; `engines` est épinglé sur 24.x).

```bash
cd react
npm install
cp .env.example .env      # puis renseigner les valeurs
npm run dev               # http://localhost:5173
```

| Script              | Rôle                                         |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Serveur de développement                     |
| `npm run build`     | Build de production                          |
| `npm start`         | Sert le build (`react-router-serve`)         |
| `npm run typecheck` | Génère les types des routes puis lance `tsc` |

`npm start` ne lit pas `.env` : en production, les variables viennent de la plateforme.

## Variables d'environnement

Mêmes noms que la version HTML/JS : **rien à renommer dans Vercel**.

| Variable                       | Obligatoire | Description                                                              |
| ------------------------------ | :---------: | ------------------------------------------------------------------------ |
| `CLIENT_ID` / `CLIENT_SECRET`  |     oui     | Application osu! (`OSU_CLIENT_ID` / `OSU_CLIENT_SECRET` en alternative)  |
| `OSU_REDIRECT_URI`             |     oui     | URL de callback, **inchangée** : `https://<domaine>/api/auth/callback`   |
| `SESSION_SECRET`               |     oui     | Au moins 32 caractères (`BETTER_AUTH_SECRET` en alternative)             |
| `BETTER_AUTH_URL`              |     non     | URL publique ; par défaut, l'origine de `OSU_REDIRECT_URI`               |
| `AUTH_SESSION_VERSION`         |     non     | Incrémenter pour invalider **toutes** les sessions                       |
| `DIAGNOSTICS_TOKEN`            |     non     | Active `/api/auth/check` (16 caractères min.) ; sinon l'endpoint répond 404 |
| `GEMINI_API_KEY`               |     non     | Clé Gemini pour Stack (sans elle, le panneau indique que Stack n'est pas configuré) |
| `GEMINI_MODEL`                 |     non     | Modèle principal (défaut `gemini-3.1-flash-lite`, repli automatique)     |

## Fidélité au design

- [`app/legacy.css`](app/legacy.css) est votre `style.css` **sans aucune modification**, hormis le chemin
  du logo (`url("shosu.png")` → `url("/shosu.png")`, car l'image est servie depuis `public/`).
- Le balisage (classes, ids, structure des cartes, du header, des filtres…) est celui de
  `index.html` et de `script.js`. Le thème clair bascule la classe `light-mode` sur `<body>`.
- [`app/overrides.css`](app/overrides.css) contient les seuls compléments : neutraliser quelques styles
  par défaut de HeroUI et conserver le repère de focus clavier.
- Les styles HeroUI sont importés **sans le reset CSS de Tailwind** (il change l'interligne, la graisse des
  titres et les marges) et **seulement pour Button et Input** (HeroUI définit des classes homonymes des
  vôtres, comme `.search-field`, `.spinner` ou `.pagination`). Les listes déroulantes de filtres restent
  des `<select>` natifs, comme dans votre version.

Le rendu a été comparé à la version HTML/JS (accueil, résultats, cartes, thème clair, mobile).

## Authentification

Better Auth remplace le module maison (`api/_auth.js`). Mêmes URLs et mêmes fonctions :

| Fonction                    | URL                                   |
| --------------------------- | ------------------------------------- |
| Connexion                   | `GET /api/auth/login`                 |
| Changer de compte           | `GET /api/auth/login?switch=1`        |
| Callback OAuth              | `GET /api/auth/callback`              |
| Diagnostic de configuration | `GET /api/auth/check` (protégé, voir ci-dessous) |
| Déconnexion                 | `POST /api/auth/sign-out` (Better Auth) |

- OAuth 2.0 avec **PKCE** et paramètre `state`, scope `identify` uniquement (l'ancienne version demandait
  aussi `public`, inutile pour lire le profil).
- Sans base de données : la session et l'état OAuth sont des cookies **chiffrés (JWE)**, `HttpOnly`,
  `Secure`, `SameSite=Lax`, valables 7 jours.
- Le plan `free` est conservé dans la session côté serveur, prêt pour une future gestion d'abonnement.
- L'URL de callback déjà enregistrée dans osu! continue de fonctionner : `/api/auth/callback` relaie
  vers Better Auth ([`api.auth.callback.ts`](app/routes/api.auth.callback.ts)).
- `/api/auth/check` n'est plus public : chaque appel utilise le secret osu!. Il répond 404 tant que
  `DIAGNOSTICS_TOKEN` n'est pas défini, puis exige `Authorization: Bearer <DIAGNOSTICS_TOKEN>`.
- L'état de connexion est lu **côté serveur** dans le `loader` du layout : plus de requête
  `/api/auth/me` au chargement, donc plus de clignotement du bouton « Se connecter ».

**Limites.** Une session ne peut pas être révoquée individuellement (compromis du mode sans base) :
incrémentez `AUTH_SESSION_VERSION` pour tout invalider. osu! ne fournit pas d'e-mail : un identifiant
technique `<id>@users.osu.invalid` est généré. Pour des comptes persistants (abonnements, favoris…),
ajoutez une option `database` à `betterAuth()` dans [`app/lib/auth.server.ts`](app/lib/auth.server.ts).

## Stack, l'assistant IA (Gemini)

Le bouton **Stack** du header ouvre un panneau latéral de discussion. Il comprend ce qu'on lui demande,
**lance lui-même les recherches** et peut lire ton profil osu! pour proposer des maps à ton niveau.
Le nom et le logo se changent dans [`app/lib/assistant.ts`](app/lib/assistant.ts) (`ASSISTANT_NAME`,
`ASSISTANT_LOGO`, image dans `public/`).

**Ce qu'il sait faire.** Deux outils, exécutés par le serveur (Gemini ne touche à rien directement) :
- `search_beatmaps` : cherche de vraies beatmaps chez osu! (mots-clés, mode, statut, fourchette d'étoiles).
  Les résultats s'affichent en cartes sous sa réponse, avec aperçu audio et un lien « Voir dans la recherche »
  qui ouvre la page principale déjà remplie (`/?q=…&mode=…&status=…`).
- `get_player_profile` : profil **public** du joueur connecté (pp, rang, précision, 25 meilleurs scores),
  envoyé sans pseudo ni identifiant.

Il ne cite que des beatmaps renvoyées par la recherche : il n'en invente pas. La conversation est
gardée dans l'onglet (sessionStorage) et disparaît à sa fermeture ; rien n'est enregistré côté serveur.

**Sécurité de la clé et de l'endpoint** (`POST /api/assistant`).
- La clé reste côté serveur (variable d'environnement) et part dans l'en-tête `x-goog-api-key`, jamais
  dans une URL. Elle n'est ni dans le bundle navigateur ni dans les journaux.
- Réservé aux utilisateurs connectés, avec contrôle d'origine (anti-CSRF) et corps limité à 16 Ko.
- L'historique envoyé par le navigateur n'est pas cru : seuls des textes « user » / « assistant » bornés
  sont acceptés (aucun faux message système ni faux appel d'outil), et le dernier message doit être celui de l'utilisateur.
- Limites : 20 messages / 10 min par utilisateur, 200 / heure au total, 4 allers-retours avec le modèle et
  5 appels d'outils maximum par message. L'état est en mémoire, donc propre à chaque instance serverless ;
  pour une garantie stricte, utilisez un stockage partagé (Vercel KV, Upstash).
- Les titres de beatmaps, les résultats d'outils et les messages sont traités comme des **données**
  (consigne anti-injection, testée). Les outils sont en lecture seule : même détourné, l'assistant ne peut
  que lancer des recherches. Sa réponse est nettoyée, bornée et affichée comme du texte, jamais comme du HTML ;
  les liens sont construits par le site, jamais par le modèle.
- Si le modèle principal est saturé (429/5xx), les modèles de repli sont essayés automatiquement.

**Confidentialité.** Les messages et les statistiques publiques utiles à la demande sont transmis à l'API
Gemini de Google (c'est indiqué sous la zone de saisie). Consultez les conditions de Google pour l'offre de
votre clé (les offres gratuites peuvent autoriser l'amélioration des modèles).

**Mise en place.** Créez une clé sur <https://aistudio.google.com/apikey>, ajoutez-la dans `.env` en local et
dans les variables d'environnement de Vercel (Production et Preview). Idéalement, limitez-la côté Google
(quota, restriction d'API). Une réponse prend quelques secondes.

## Ce qui change par rapport à la version HTML/JS

- **Pagination** : « Next → » charge la page suivante de résultats chez osu! quand il y en a une
  (avant, seule la première page de 50 résultats était accessible).
- **Filtres** : le mode et le statut sont aussi transmis à osu! lorsque son API les connaît ;
  le filtrage côté navigateur est conservé pour les autres (Approved, Deleted…).
- **Sécurité** : les titres et pseudos venant d'osu! sont rendus par React (échappés) au lieu
  d'`innerHTML` ; en-têtes de sécurité sur chaque page (CSP à nonce en production, HSTS,
  `X-Frame-Options`, `Permissions-Policy` limitant le micro à la recherche vocale…).
- **Connexion** : un échec ou un refus sur osu! affiche un bandeau au lieu d'une page JSON brute.
- **Accessibilité** : touche Échap pour fermer le menu du compte, repère de focus clavier visible.
- Les sessions existantes sont invalidées (nouveau format de cookie) : chacun doit se reconnecter une fois.
- `/api/preview` n'est pas reprise (l'interface lit directement l'audio d'osu!), ni `/api/auth/me`
  ni `/api/auth/logout` (remplacées par les endpoints de Better Auth).

## Déploiement sur Vercel

1. Créer un projet Vercel pointant sur ce dépôt avec **Root Directory = `react`**.
2. Reprendre les variables d'environnement du projet existant (voir le tableau ci-dessus).
3. Aucune modification de l'application osu! : l'URL de callback reste `…/api/auth/callback`.

> **Preset Vercel.** `@vercel/react-router` déclare une dépendance à React Router 7 et n'est donc pas
> installé. Le déploiement repose sur la détection native de Vercel : vérifiez une première
> Preview avant de basculer la production.

## Structure

```
react/
├── app/
│   ├── root.tsx, routes.ts, entry.server.tsx   Document, routes, en-têtes de sécurité
│   ├── app.css                                 Imports (HeroUI sans reset Tailwind)
│   ├── legacy.css                              Votre style.css d'origine
│   ├── overrides.css                           Compléments minimaux
│   ├── assistant.css                           Styles du panneau Stack
│   ├── routes/
│   │   ├── layout.tsx                          Header (compte), footer, bandeau de connexion
│   │   ├── home.tsx                            Hero, recherche, filtres, résultats
│   │   ├── api.assistant.ts                    POST /api/assistant (auth, limites, validation)
│   │   ├── api.search.ts                       GET /api/search
│   │   └── api.auth.*.ts                       login, callback, check, endpoints Better Auth
│   ├── components/                             Account, Assistant (Stack), BeatmapCard, ThemeToggle, LoginNotice
│   └── lib/                                    auth, session, client osu!, Gemini, assistant, hooks
└── public/                                     shosu.png (logo), stack.jpeg (logo de l'assistant)
```
