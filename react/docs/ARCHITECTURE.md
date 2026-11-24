# Architecture de shOsu!

## Stack

| Rôle | Choix |
| --- | --- |
| Framework | React Router 8 en *framework mode* (SSR, loaders/actions, routes « resource » pour les API) |
| UI | HeroUI v3 (`Button`, `Input` uniquement) + Tailwind 4 **sans preflight** ; le design est celui de `app/legacy.css` (repris tel quel) |
| Auth | Better Auth, connexion osu! (OAuth 2.0 + PKCE), sessions *stateless* (cookie chiffré JWE) |
| IA | Gemini (REST, appels d'outils, flux SSE) pour Stack et la recherche par le son |
| Données | Upstash Redis via REST (`store.server.ts`), repli en mémoire sans base |
| Hébergement | Vercel, projet `shosu-gxdj`, *Root Directory* = `react`, fonctions en `iad1` ; un push sur `main` déploie en production |
| Domaine | https://shosure.vercel.app |

## Arborescence (`react/`)

```
app/
  root.tsx, entry.server.tsx, entry.client.tsx   coque HTML, en-têtes de sécurité (CSP à nonce), hydratation
  routes.ts                                      table des routes (voir ci-dessous)
  routes/                                        une page ou une API par fichier (api.*.ts = API JSON)
  components/                                    composants React (cartes, panneau Stack, lecteur, menus…)
  lib/                                           logique. *.server.ts = serveur uniquement ; le reste est partagé serveur + navigateur
  legacy.css                                     feuille d'origine du propriétaire, NE PAS MODIFIER
  overrides.css, pages.css, motion.css, assistant.css, theme.css, mobile.css, app.css   ajouts (app.css les assemble : … motion, theme, puis mobile en dernier)
public/                                          icônes, logo de Stack, manifeste
dev/                                             faux services pour tester en local (voir dev/README.md)
docs/                                            cette documentation
```

Règle de nommage importante : un module qui touche aux secrets, à Redis ou à l'API osu! **doit** s'appeler `*.server.ts` (jamais importé côté navigateur).
Les types partagés vivent dans des modules neutres (`osu.ts`, `insights.ts`, `collections.ts`, `assistant.ts`, `lists.ts`, `plans.ts`, `history.tsx`…).

## Routes

Pages (toutes dans `routes/layout.tsx`, qui fournit le header, le lecteur, Stack, le contexte des listes et de l'historique) :
`/` accueil · `/beatmap/:id` · `/player/:id` · `/lists` · `/collection/:id` · `/history` · `/stats` · `/dna` · `/compare` · `/collections` · `/premium` · `*` (404).

API (JSON, dans `routes/api.*.ts`) :
`/api/search` · `/api/assistant` (flux NDJSON) · `/api/listen` (flux NDJSON, audio) · `/api/lists` · `/api/collections` · `/api/similar` ·
`/api/analysis` · `/api/recommendations` · `/api/progress` (GET public, POST = relevé du jour) · `/api/performance` · `/api/dna` (POST, privé) · `/api/profile` (POST) · `/api/admin/plan` · `/api/auth/*` (login, callback, check, Better Auth).

## Flux de données

```
navigateur ──fetch──▶ routes/api.*.ts ──▶ lib/*.server.ts ──▶ API osu! (client_credentials, jeton en cache par instance)
                              │                     └────────▶ Gemini (clé côté serveur)
                              └────────────────────────────────▶ Redis Upstash (listes, collections, plans)
```

- **API osu!** : `osu.server.ts` obtient un jeton `client_credentials` (scope `public`) mis en cache par instance. `osuGet` / `osuPost` sont les seuls points d'entrée.
  Toutes les lectures de données de joueur/beatmap passent par là, avec `cached()` (TTL en mémoire) pour économiser le quota.
- **Session** : `session.server.ts#getUser(request)` renvoie `{id, name, image, osuId, plan}` ou `null`. L'identifiant osu! est lu dans l'e-mail fabriqué `<id>@users.osu.invalid`.
  Toute route qui agit pour un joueur commence par `getUser`.
- **Stack** : `api.assistant.ts` → `assistant.server.ts#runAssistant` (boucle modèle ⇄ outils, événements NDJSON) → `gemini.server.ts#streamContent`.

## Stockage (Redis) — clés

| Clé | Type | Contenu | Module |
| --- | --- | --- | --- |
| `shosu:u:<osuId>:favorites` / `:later` | hash | id de beatmapset → JSON allégé + `addedAt` | `lists.server.ts` |
| `shosu:cols:<osuId>` | hash | id de collection → métadonnées JSON | `collections.server.ts` |
| `shosu:col:<collectionId>` | hash | id de beatmapset → JSON allégé + `addedAt` | `collections.server.ts` |
| `shosu:colidx` | hash | id de collection → osuId du propriétaire | `collections.server.ts` |
| `shosu:colpublic` | hash | id de collection **publique** → métadonnées JSON (découverte, profils) | `collections.server.ts` |
| `shosu:profiles` | hash | osuId → `{bio, accent, banner, featured[]}` (profil personnalisé) | `profile-custom.server.ts` |
| `shosu:snap:<osuId>` | hash | `<mode>:<AAAA-MM-JJ>` → `{pp, rank, accuracy, plays}` (relevés quotidiens, ~120 j) | `progress.server.ts` |
| `shosu:plans` | hash | osuId → `{plan, until}` | `plans.server.ts` |
| `rl:<clé>:<fenêtre>` | string | compteur de limite de débit (fenêtre fixe) | `rate-limit.server.ts` |

(Les fonctionnalités ajoutées ensuite ajoutent leurs clés dans [FEATURES.md](FEATURES.md) **et** dans ce tableau.)

### Économie de commandes Redis (quota gratuit : 500 000 / mois)

- Une écriture de liste coûte ~3 commandes, un message Stack ~4. Les routes très fréquentes et peu coûteuses (`/api/search`, `/api/similar`, `/api/analysis`,
  `/api/recommendations`, page publique d'une collection) utilisent des limites **par instance** (`rateLimit(..., false)`), donc **zéro** commande Redis.
- Sans base (`KV_REST_API_URL` absent) tout fonctionne en mémoire, mais sans persistance ni partage entre instances ; les API de collections refusent alors d'écrire (`storage_not_persistent`).

## Sécurité (à respecter pour toute nouvelle route)

- **Secrets** : uniquement dans des modules `*.server.ts`, jamais dans le bundle client (vérifié en cherchant les valeurs dans `build/`).
- **POST** : vérifier `Origin === origine du site` (anti-CSRF), authentifier (`getUser`), limiter le débit, borner la taille du corps, valider chaque champ (types, bornes, regex).
- **Propriété** : une ressource d'un joueur ne se lit/modifie qu'après contrôle du propriétaire côté serveur (ex. `ownedBy` dans `collections.server.ts`). Une ressource privée répond 404, pas 403.
- **Données privées** : `Cache-Control: no-store` / `private` ; jamais de cache CDN ou partagé pour une réponse propre à un utilisateur.
- **Données publiques** (recherche, similaires, analyse) : en-têtes `public, s-maxage=…` pour le CDN.
- **Entrées utilisateur → modèle** : les textes (titres, pseudos) sont des *données*, pas des instructions ; nettoyés (`clean`) et bornés avant d'aller à Gemini. Les actions de Stack sont revalidées côté navigateur (`actionUrl`).
- **Fichiers générés** (exports) : tout texte injecté est échappé (HTML, CSV avec garde contre les formules).
- **CSP** (production) : `script-src 'self' 'nonce-…'`, `img-src` limité à nos hôtes et aux images osu! ; HSTS, `X-Frame-Options: DENY`. Les `style=""` en ligne sont autorisés (`style-src 'unsafe-inline'`).
- Les données de joueurs lues chez osu! sont publiques, mais on n'en garde que le strict nécessaire (listes allégées).

## Mise en page et CSS

- `legacy.css` : feuille d'origine du propriétaire (structure des cartes, du header, de la recherche), couleurs d'origine ; ses variables (`--text`, `--muted`, `--line`, `--panel`, `--accent`…) sont **redéfinies par `theme.css`**. Thème clair via `body.light-mode`.
- `theme.css` : **structure visuelle iptron.one** (cadre de page, en-tête de verre, boutons, cartes, compositeur de Stack) avec **les couleurs et la police d'origine de shOsu!**. Importé après `motion.css` et avant `mobile.css`.
- `pages.css` : pages et composants nouveaux (lecteur, listes, détail, profil, collections, similaires, analyse, historique…).
- `motion.css` : courbes `--ease-out` / `--ease-spring`, animations d'entrée, états actifs ; tout est coupé sous `prefers-reduced-motion`.
- `assistant.css` : panneau Stack et ses animations.
- `mobile.css` : **tout** ce qui change sous 700 px (importé en dernier) ; voir FEATURES § Mobile.
