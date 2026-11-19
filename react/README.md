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

Prérequis : Node.js ≥ 20.

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
| Diagnostic de configuration | `GET /api/auth/check`                 |
| Déconnexion                 | `POST /api/auth/sign-out` (Better Auth) |

- OAuth 2.0 avec **PKCE** et paramètre `state`, scope `identify` uniquement (l'ancienne version demandait
  aussi `public`, inutile pour lire le profil).
- Sans base de données : la session et l'état OAuth sont des cookies **chiffrés (JWE)**, `HttpOnly`,
  `Secure`, `SameSite=Lax`, valables 7 jours.
- Le plan `free` est conservé dans la session côté serveur, prêt pour une future gestion d'abonnement.
- L'URL de callback déjà enregistrée dans osu! continue de fonctionner : `/api/auth/callback` relaie
  vers Better Auth ([`api.auth.callback.ts`](app/routes/api.auth.callback.ts)).
- L'état de connexion est lu **côté serveur** dans le `loader` du layout : plus de requête
  `/api/auth/me` au chargement, donc plus de clignotement du bouton « Se connecter ».

**Limites.** Une session ne peut pas être révoquée individuellement (compromis du mode sans base) :
incrémentez `AUTH_SESSION_VERSION` pour tout invalider. osu! ne fournit pas d'e-mail : un identifiant
technique `<id>@users.osu.invalid` est généré. Pour des comptes persistants (abonnements, favoris…),
ajoutez une option `database` à `betterAuth()` dans [`app/lib/auth.server.ts`](app/lib/auth.server.ts).

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
│   ├── routes/
│   │   ├── layout.tsx                          Header (compte), footer, bandeau de connexion
│   │   ├── home.tsx                            Hero, recherche, filtres, résultats
│   │   ├── api.search.ts                       GET /api/search
│   │   └── api.auth.*.ts                       login, callback, check, endpoints Better Auth
│   ├── components/                             Account, BeatmapCard, ThemeToggle, LoginNotice
│   └── lib/                                    auth, session, client osu!, hooks (audio, voix, ripple)
└── public/shosu.png                            Logo (version allégée, même image)
```
