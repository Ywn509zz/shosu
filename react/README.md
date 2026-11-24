# shOsu! — version React

Version React de shOsu! (bêta 3.11), construite **à partir de la version HTML/CSS/JS de ce dépôt**,
qui reste intacte à la racine. Le design est strictement le vôtre : la feuille de style
d'origine est reprise telle quelle et le balisage est le même.

| Besoin                    | Choix                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| Routing + rendu serveur   | [React Router 8](https://reactrouter.com) en *framework mode*         |
| Composants                | [HeroUI v3](https://www.heroui.com) (`Button`, `Input`) + Tailwind 4  |
| Authentification          | [Better Auth](https://www.better-auth.com), connexion via osu! (OAuth) |

## Documentation pour reprendre le projet

Point d'entrée pour toute IA ou tout développeur : [`AGENTS.md`](AGENTS.md). Il renvoie vers [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (stack, flux, sécurité, clés Redis),
[`docs/FEATURES.md`](docs/FEATURES.md) (**comment chaque fonctionnalité marche et doit marcher**), [`docs/DEV-GUIDE.md`](docs/DEV-GUIDE.md) (lancer en local avec de faux services, tester, versionner, publier)
et [`dev/README.md`](dev/README.md). **Chaque modification du site met à jour ces fichiers dans le même commit.**

## Versions

La version affichée en bas de page vient de [`APP_VERSION`](app/lib/config.ts). **Elle se change à chaque modification du site**, en même
temps que `version` dans `package.json` (« bêta 3.11 » ↔ `3.11.0`).

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
| `PREMIUM_USER_IDS`             |     non     | Identifiants osu! (séparés par des virgules) qui ont le plan Premium, sans limite de durée |
| `ADMIN_TOKEN`                  |     non     | Active `/api/admin/plan` (24 caractères min.) pour attribuer le Premium ; sinon l'endpoint répond 404 |
| `ADMIN_USER_IDS`               |     non     | Identifiants osu! des administrateurs (séparés par des virgules) : accès à `/admin` (quotas) et alerte de quota |
| `REDIS_MONTHLY_LIMIT`          |     non     | Quota mensuel de commandes Redis pour les alertes (défaut 500 000, plan gratuit d'Upstash) |
| `GEMINI_DAILY_LIMIT`          |     non     | Plafond de requêtes Gemini par jour affiché sur /admin (défaut 1 000, indicatif) |
| `DIAGNOSTICS_TOKEN`            |     non     | Active `/api/auth/check` (16 caractères min.) ; sinon l'endpoint répond 404 |
| `GEMINI_API_KEY`               |     non     | Clé Gemini pour Stack (sans elle, le panneau indique que Stack n'est pas configuré) |
| `GEMINI_MODEL`                 |     non     | Modèle principal (défaut `gemini-3.1-flash-lite`, repli automatique)     |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | non | Base Redis : listes persistantes et limites de débit partagées (`KV_REST_API_URL` / `KV_REST_API_TOKEN` acceptées) |

## Identité visuelle

Depuis la bêta 3.1 le site reprend la **structure** visuelle de [iptron.one](https://iptron.one) (cadre de page, en-tête de verre, boutons et cartes sobres, compositeur de Stack en carte) avec les **couleurs violettes et la police d'origine** de shOsu! (bêta 3.3). Tout est centralisé dans [`app/theme.css`](app/theme.css) (voir `docs/FEATURES.md` § Thème visuel).

## Fidélité au design (historique)

*Jusqu'à la bêta 3.0 le site reprenait strictement le design d'origine ; depuis la 3.1, `theme.css` recolore et re-type cette base (voir « Identité visuelle »). La structure (balisage, cartes, header, filtres) reste celle d'origine.*

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
- Le plan `free` est conservé dans la session côté serveur, prêt pour d'éventuels plans.
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

## Plans : Gratuit et Premium

| | Gratuit | Premium |
|---|---|---|
| Recherche, suggestions, profils, pages de beatmaps, lecteur | ✓ | ✓ |
| Messages à Stack | 20 / 10 min | **100 / 10 min** |
| Taille de chaque liste (favoris, à jouer plus tard) et de chaque collection | 200 | **1 000** |
| Collections personnalisées partageables | 5 | **25** |
| Recherche par le son | 6 extraits / 10 min | 6 extraits / 10 min |

Les limites sont définies **à un seul endroit** : [`app/lib/plans.ts`](app/lib/plans.ts). La page `/premium` les affiche, le menu du compte montre le plan
(badge « ✦ Premium »), la page *Mes listes* indique « n / limite », et un compte gratuit qui atteint la limite de Stack voit un rappel du Premium.
**shOsu! est entièrement gratuit : il n'y a aucun paiement.** Le Premium est attribué à la main, sur invitation (amis, soutiens, bêta-testeurs), pour offrir plus de messages
Stack et de place dans les listes à certains joueurs ; tous les autres restent sur le plan Gratuit, avec toutes les fonctionnalités.

**Attribuer le Premium** (deux moyens) :
1. **Variable `PREMIUM_USER_IDS`** dans Vercel (ex. `727,1234`) : permanent, sans base de données. Un redéploiement est nécessaire pour la modifier.
2. **Endpoint `/api/admin/plan`** (avec `ADMIN_TOKEN`), effet immédiat et durée possible. Exige une **base Upstash** (sans elle, l'attribution serait perdue au
   prochain redéploiement : l'endpoint refuse avec `storage_not_persistent`) :
   ```bash
   curl -X POST https://<domaine>/api/admin/plan \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{"osuId": 727, "plan": "premium", "days": 30}'   # "days" facultatif ; "plan": "free" retire le Premium
   ```
   `GET /api/admin/plan?osuId=727` (même jeton) indique le plan courant. Sans jeton valide : 404, comme si la route n'existait pas.

**Sécurité.** Le plan est lu **côté serveur** (le navigateur ne peut pas se l'attribuer), gardé 60 s en mémoire, et en cas de doute ou de panne de la base on retombe sur
« gratuit » : jamais d'avantage donné par erreur. Le jeton d'administration est comparé en temps constant, limité à 30 essais / min / IP, et exigé à 24 caractères minimum.

**Si un jour vous voulez faire payer** (rien n'est prévu) : le webhook d'abonnement n'aura qu'à appeler `setPlan(osuId, "premium", jours)` (et `"free"` à l'annulation) : tout le reste (limites, badge,
pages) fonctionne déjà. Stripe héberge la page de paiement : le site ne voit jamais de données de carte.

## Fonctionnalités du site

- **Lecteur d'aperçus** : une seule piste à la fois pour tout le site. Une barre fixe en bas de l'écran (cover, titre,
  ⏮ ▶/⏸ ⏭, position, volume mémorisé) apparaît dès qu'on lance un aperçu ; les cartes d'une même liste s'enchaînent.
- **Suggestions « À découvrir »** sous la recherche (tant qu'aucune recherche n'est affichée) : les plus jouées, récemment classées, les plus
  aimées, ou une sélection surprise. Chaque visite tire 18 beatmaps au hasard parmi les 40 premières de chaque tri ; « 🔄 Autres suggestions »
  fait défiler les suivantes. Aucune connexion requise ; si osu! ne répond pas, la page s'affiche simplement sans elles.
- **Recherche par le son** : le bouton 🎧 de la barre de recherche (et celui de Stack) identifie un morceau et trouve des maps proches
  (voir « Shazam pour osu! » plus bas).
- **Favoris et « à jouer plus tard »** : boutons ♡ et 🕒 sur chaque carte et sur la page d'une beatmap, page **Mes listes**
  (`/lists`). 200 beatmaps par liste ; les métadonnées sont relues chez osu!, jamais prises du navigateur.
- **Collections personnalisées** (`/lists?list=collections`, bouton 📁 sur chaque carte) : listes nommées, créées et remplies depuis les cartes.
  Un bouton **Partager** rend une collection publique : toute personne qui a le lien (`/collection/<id>`, identifiant aléatoire de 10 caractères)
  peut la voir, l'exporter ou la **copier** dans ses propres collections, sans pouvoir la modifier. Une collection privée est introuvable (404)
  pour tout autre que son propriétaire. Limites par plan (voir plus haut) ; stockage Redis (`shosu:cols:<id osu!>`, `shosu:col:<id>`, `shosu:colidx`).
- **Découverte des collections publiques** (`/collections`) : recherche, tri, copie dans ses collections ; **partage d'une liste** (favoris, à jouer plus tard) en un clic ;
  **profils personnalisables** (biographie, couleur, bannière, collections en vedette) sur le profil de chaque joueur.
- **Export d'une liste en un seul fichier** (favoris, à jouer plus tard, collections) : un **téléchargeur** `.html` autonome (télécharge toutes les
  beatmaps en un clic depuis le miroir communautaire de ton choix : Beatconnect, Mino, Nerinyan, osu! officiel ou le jeu via `osu://`), un `.txt`,
  un `.csv` (protégé contre l'injection de formules) ou un `.json`. Tout est fabriqué dans le navigateur : shOsu! n'héberge ni ne relaie aucune
  beatmap, et les titres sont toujours échappés dans le fichier généré.
- **Pour toi** (accueil, une fois connecté) : recommandations d'après tes habitudes de jeu. Le serveur lit tes 100 meilleurs scores, tes scores récents,
  tes beatmaps les plus jouées et tes favoris chez osu!, en déduit ta zone de difficulté, ton BPM, tes mods et tes artistes/tags favoris, cherche
  autour de ces goûts et classe les résultats (difficulté un peu au-dessus de ta médiane pour progresser, BPM, artistes, tags, popularité), en
  excluant ce que tu as déjà joué. Chaque carte donne ses raisons. Calcul gardé 15 min, 12 par 10 min et par joueur.
- **Beatmaps similaires** (page d'une beatmap, `/api/similar`) : candidats trouvés autour de l'artiste, de la source et des tags les plus distinctifs,
  classés par artiste, tags communs, BPM, difficulté, mappeur, genre et langue ; les raisons s'affichent sur chaque carte.
- **Analyse de difficulté par mod** (clic sur une difficulté, `/api/analysis`) : étoiles recalculées par osu! pour NM, EZ, HR, HT, DT, DT+HR et FL
  (`POST /beatmaps/{id}/attributes`), AR/OD/CS/HP/BPM/durée avec les formules des mods, décomposition aim / vitesse et courbe de difficulté du set.
- **Suivi de progression** (profil de tout joueur et `/stats`) : variations du rang et des pp, rang sur 90 jours, parties par mois, courbes de pp et de précision (relevés quotidiens
  pour les joueurs connectés à shOsu!), modes préférés. **Analyse des performances** : points forts et faibles (précision par difficulté/BPM, échecs récents, mods) avec des pistes.
  **Mes statistiques** (`/stats`) regroupe tout cela avec ton activité sur shOsu!. Détails dans [`docs/FEATURES.md`](docs/FEATURES.md).
- **Music DNA** (`/dna`) : ton empreinte musicale (genres, langues, tempo, artistes, ambiance) tirée de tes favoris, de tes beatmaps les plus jouées et de tes consultations, avec des
  morceaux jamais joués qui y correspondent. **Similar Sound** : onglet « Musique proche » (même artiste, BPM, genre, langue, ambiance) sur chaque beatmap.
  **Comparer deux beatmaps** (`/compare`) et **partager une beatmap** avec un lien qui s'affiche bien dans Discord. Stack dispose des outils correspondants.
- **Confidentialité et Mes données** : page `/privacy` (ce que shOsu! lit, garde, partage ; Gemini ; cookies), page `/my-data` pour **télécharger** (JSON) et **supprimer** ses données.
  **Quotas** (`/admin`, administrateurs seulement) : usage de Redis, d'osu! et de Gemini, projection de fin de mois et alerte. **Tests** (`npm test`) et CI GitHub.
- **Recherche avancée** : filtres étoiles / BPM / durée et tri (appliqués côté osu!), liens profonds partageables. **Importer ses favoris osu!** dans ses listes en un clic.
  **Comparer deux joueurs** (`/compare/players`) : statistiques, style de jeu, modes préférés, beatmaps en commun. **États vides** avec une action utile partout.
- **Score de compatibilité expliqué** : sur chaque recommandation, le pourcentage se déplie en « Pourquoi 77 % ? » (critère par critère, points obtenus ÷ possibles). **Données partagées** :
  Music DNA, statistiques et recommandations lisent le même modèle du joueur (mêmes artistes, tags, tempo, genres, sources).
- **Joueurs** (`/players`) : classement osu! par mode et par pays, recherche d'un joueur, accès au profil et à la comparaison.
- **Historique** (`/history`) : recherches, écoutes et beatmaps consultées récentes, gardées **uniquement dans le navigateur** (localStorage, un historique par compte
  osu!) : rien n'est envoyé au serveur. Les dernières recherches s'affichent aussi sous la barre de recherche.
- **Page d'une beatmap** (`/beatmap/:id`) : cover, BPM, durée, favoris, tags, toutes les difficultés (étoiles, CS/AR/OD/HP,
  combo), « Ouvrir dans osu! » (`osu://`), et « ✨ Expliquer avec Stack ».
- **Profil joueur** (`/player/:id`, identifiant ou pseudo) : rangs, pp, précision, niveau, temps de jeu, grades, 25 meilleurs scores,
  par mode. Accessible depuis le menu du compte (« Mon profil ») et depuis Stack.
- **Raccourcis clavier** (jamais actifs pendant une saisie) : `/` recherche · `S` ouvrir/fermer Stack · `Espace` lecture/pause ·
  `Échap` fermer Stack.
- **Cache** : les recherches sont gardées 60 s en mémoire et le CDN de Vercel les sert 60 s (puis 5 min en actualisant en arrière-plan) ;
  les pages détail, profils et classements sont gardés 5 min. Cela économise le quota osu! sans jamais servir de donnée propre à un utilisateur.

## Stockage et limite de débit partagée (Upstash)

Les listes et les limites de débit passent par [`app/lib/store.server.ts`](app/lib/store.server.ts) :
- **Avec Upstash Redis** (variables ci-dessus) : les listes survivent aux redéploiements, et les limites (`/api/assistant`, `/api/listen`, `/api/lists`)
  sont **partagées entre toutes les instances**. La recherche (très fréquente, déjà servie par le cache CDN) garde un compteur par instance :
  elle ne consomme aucune commande Redis.
- **Sans base** : tout fonctionne, mais en mémoire (listes perdues au redéploiement, limites « par instance »). La page *Mes listes*
  l'indique.
- **Base en panne** : les limites retombent sur la mémoire (le site continue), les listes répondent « indisponible » plutôt que de perdre des données.

**État actuel :** la base `shosu-redis` (Upstash, plan gratuit, région `iad1`) est reliée au projet Vercel : les listes sont persistantes.

**Mise en place.** Dans Vercel : *Storage* (ou *Marketplace*) → **Upstash Redis** → créer une base gratuite et la relier au projet : les
variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` sont ajoutées toutes seules (acceptées telles quelles). Puis redéployer.
**Coût : 0 €.** Le plan gratuit d'Upstash donne 256 Mo et 500 000 commandes par mois (vérifié sur upstash.com/pricing/redis ;
n'ajoutez **pas** de moyen de paiement, sinon le compte passe en payant). Une écriture de liste coûte 3 commandes, un message Stack 4 :
la recherche a donc été exclue du compteur partagé pour garder le quota.
Limites appliquées : 20 messages Stack / 10 min par joueur, 200 / h au total, 120 modifications de listes / 10 min par joueur,
90 recherches / min par adresse IP (par instance).

## Stack, l'assistant IA (Gemini)

Le bouton **Stack** du header (ou la touche `S`) ouvre un panneau latéral de discussion. Il comprend ce qu'on lui demande, **lance lui-même
les recherches**, lit ton profil osu! pour proposer des maps à ton niveau et **agit sur la page**. Les réponses s'écrivent **en direct**
(flux), avec l'outil en cours affiché (« Je cherche… »). On peut aussi lui **dicter** un message (micro). Le nom et le logo se changent dans
[`app/lib/assistant.ts`](app/lib/assistant.ts) (`ASSISTANT_NAME`, `ASSISTANT_LOGO`, image dans `public/`).

**Ce qu'il sait faire.** Des outils, exécutés par le serveur (Gemini ne touche à rien directement) :
- `search_beatmaps` : de vraies beatmaps (mots-clés, mode, statut, fourchette d'étoiles), en cartes avec aperçu audio.
- `get_player_profile` : profil **public** du joueur connecté (pp, rang, précision, 25 meilleurs scores), envoyé sans pseudo ni identifiant.
- **Ton compte osu!** (`get_my_account`, `get_my_scores`, `get_my_beatmaps`, `get_my_activity`) : Stack consulte **toutes les données publiques** de ton
  compte, celles que montre ton profil sur osu.ppy.sh : identité et profil, statistiques des quatre modes (pp, rang mondial et national, précision, temps
  de jeu, grades, niveau…), évolution du rang sur 90 jours, badges, succès, groupes, kudosu, parties par mois, scores (meilleurs, récents, premières
  places, épinglés, avec mods, pp, précision, erreurs), beatmaps (favorites, les plus jouées, celles que tu as créées, invitées, nominées) et activité
  récente. **Rien de privé** : la connexion ne demande que la permission `identify`, donc ni amis, ni messages, ni e-mail (Stack le dit si on lui
  demande). Ces données passent par Gemini comme le reste de la conversation ; elles ne sont pas conservées côté serveur (cache mémoire de 2 à 5 min).
- `get_recommendations` : recommandations d'après tes habitudes (voir « Pour toi »), avec la raison de chaque conseil.
- `find_similar_maps` et `analyze_difficulty` : beatmaps proches d'une autre, et difficulté avec chaque mod (EZ, HR, HT, DT…) et décomposition aim / vitesse.
- `get_my_collections`, `create_collection`, `add_to_collection` : créer une collection et y ranger des beatmaps affichées (3 modifications de listes
  au plus par message).
- `get_beatmap` : BPM, durée, tags, difficultés avec CS/AR/OD/HP et nombre d'objets, pour **expliquer** une map à partir de ses chiffres.
- `find_player` et `get_rankings` : retrouver un joueur par pseudo, ou consulter le classement mondial ou d'un pays (cartes de joueurs).
- `get_my_lists`, `add_to_list`, `remove_from_list` : gérer tes listes, sur demande explicite et seulement pour des beatmaps déjà affichées.
- 🎧 **écoute** (voir plus bas) : identifier un son et trouver des maps proches.
- `show_in_search`, `open_beatmap`, `open_player` : ouvrir la recherche déjà remplie (`/?q=…&mode=…&status=…`), une beatmap ou un profil.
  Le navigateur revalide chaque action et ne navigue que vers les pages du site.

Il ne cite que des données renvoyées par ses outils : il n'en invente pas. La conversation est gardée dans l'onglet (sessionStorage) et
disparaît à sa fermeture ; rien n'est enregistré côté serveur.

### 🎧 « Shazam pour osu! » : retrouver des maps à partir d'un son

Le bouton 🎧 permet de **faire écouter un morceau**, au micro (15 s) ou en important un fichier audio (30 Mo max) : Gemini l'écoute, puis
le site cherche les beatmaps **de ce morceau** et des beatmaps **au son proche**. On l'utilise **depuis la barre de recherche** (les maps
s'affichent dans la grille des résultats, sous un résumé de ce qui a été entendu) ou **depuis Stack** (dans la conversation). Il faut être connecté.

1. Le navigateur décode l'audio (mp3, m4a, ogg, webm…) et le convertit en **WAV 16 kHz mono de 30 s maximum**, volume normalisé
   (pour un fichier plus long : 30 s à partir de 30 % du morceau, plutôt que l'intro). Le micro est enregistré sans traitement.
2. `POST /api/listen` envoie ce WAV à Gemini, qui renvoie un **JSON contraint par un schéma** : titre et artiste (seulement s'il reconnaît
   vraiment le morceau, avec un niveau de confiance), genres, tempo estimé, ambiance, instruments, voix, et des mots-clés de recherche.
3. Le serveur cherche chez osu! les maps qui correspondent au titre et à l'artiste (appariement vérifié), puis des maps proches par mots-clés,
   **classées par proximité de tempo** (±12 % du BPM estimé en premier). Le texte de réponse est composé côté serveur.

**Honnêteté de l'identification.** Gemini n'est pas un service d'empreinte audio comme Shazam : il peut reconnaître des morceaux connus, mais
pas tous. La consigne lui interdit d'inventer un titre ; en cas de doute, Stack le dit et se contente de décrire le son et de chercher des maps
proches. Le tempo estimé est une indication. Sur un extrait de test synthétique, le tempo (120 BPM) et le style ont été correctement estimés
et aucun titre n'a été inventé.

**Sécurité.** Réservé aux utilisateurs connectés, avec contrôle d'origine ; l'en-tête du WAV est vérifié (PCM 16 bits, mono, 16 kHz, 3 à 31 s,
1 Mo environ au maximum) avant tout appel à Gemini ; 6 extraits / 10 min par joueur et 60 / h au total. Ce qui est dit ou chanté dans
l'extrait est traité comme du contenu à analyser, jamais comme une instruction, et la sortie du modèle est nettoyée et bornée. L'audio est
envoyé à Gemini (Google) pour analyse ; shOsu! ne le conserve pas.

**Sécurité de la clé et de l'endpoint** (`POST /api/assistant`).
- La clé reste côté serveur (variable d'environnement) et part dans l'en-tête `x-goog-api-key`, jamais dans une URL. Elle n'est ni dans
  le bundle navigateur ni dans les journaux.
- Réservé aux utilisateurs connectés, avec contrôle d'origine (anti-CSRF) et corps limité à 24 Ko.
- L'historique envoyé par le navigateur n'est pas cru : seuls des textes « user » / « assistant » bornés sont acceptés (aucun faux message
  système ni faux appel d'outil), et le dernier message doit être celui de l'utilisateur.
- Limites : 20 messages / 10 min par utilisateur, 200 / h au total (partagées si Upstash est configuré) ; 5 allers-retours avec le modèle,
  6 appels d'outils et 3 modifications de listes au maximum par message.
- **Modifications de listes** : seules les beatmaps déjà affichées à l'utilisateur dans la conversation sont acceptées (liste blanche), pour
  qu'un titre piégé ne puisse pas faire ajouter n'importe quoi. Tous les autres outils sont en lecture seule.
- Les titres de beatmaps, pseudos, résultats d'outils et messages sont traités comme des **données** (consigne anti-injection, testée). La
  réponse est nettoyée, bornée et affichée comme du texte, jamais comme du HTML ; les liens sont construits par le site, jamais par le modèle.
- Si aucun fragment n'arrive en 12 s ou si le modèle est saturé (429/5xx), le modèle de repli est essayé automatiquement.

**Confidentialité.** Les messages et les données publiques utiles à la demande (profil, classements…) sont transmis à l'API Gemini de Google
(c'est indiqué sous la zone de saisie). Consultez les conditions de Google pour l'offre de votre clé (les offres gratuites peuvent autoriser
l'amélioration des modèles).

**Mise en place.** Créez une clé sur <https://aistudio.google.com/apikey>, ajoutez-la dans `.env` en local et dans les variables d'environnement
de Vercel (Production et Preview). Idéalement, limitez-la côté Google (quota, restriction d'API).

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
│   ├── overrides.css, assistant.css, pages.css Compléments, panneau Stack, nouvelles pages
│   ├── routes/
│   │   ├── layout.tsx                          Header, lecteur, raccourcis, panneau Stack
│   │   ├── home.tsx                            Hero, recherche, filtres, résultats (+ lien profond ?q=)
│   │   ├── beatmap.$id.tsx, player.$id.tsx     Détail d'une beatmap, profil joueur
│   │   ├── lists.tsx, premium.tsx              Mes listes ; comparaison des plans
│   │   ├── api.admin.plan.ts                   Attribution du Premium (ADMIN_TOKEN)
│   │   ├── api.assistant.ts                    POST /api/assistant (flux, auth, limites, validation)
│   │   ├── api.listen.ts                       POST /api/listen : « Shazam pour osu! » (WAV → Gemini → maps)
│   │   ├── api.lists.ts, api.search.ts         Listes ; recherche publique (limite par IP, cache CDN)
│   │   └── api.auth.*.ts                       login, callback, check, endpoints Better Auth
│   ├── components/                             Account, Assistant (Stack), BeatmapCard, Discovery, ListenPanel, PlayerBar, ListButtons…
│   └── lib/
│       ├── store.server.ts, rate-limit.server.ts, cache.server.ts   Upstash + repli mémoire, limites, cache
│       ├── osu.server.ts, osu.ts               Client osu! (recherche, beatmap, joueurs, classements) et types
│       ├── gemini.server.ts, assistant.server.ts, assistant.ts      Client Gemini en flux, outils de Stack
│       ├── listen.server.ts, ndjson.server.ts, audio.ts             Écoute audio (analyse, recherche), flux, capture micro / WAV
│       ├── discover.server.ts, stream-client.ts                     Suggestions de l'accueil ; lecture des flux côté navigateur
│       ├── plans.ts, plans.server.ts           Définition des plans et attribution
│       ├── lists*.ts(x), player.tsx            Listes (stockage, contexte), lecteur audio global
│       └── auth*.ts, session.server.ts, use-*.ts                    Authentification, hooks
└── public/                                     shosu.png (logo), stack.jpeg (logo de l'assistant)
```
