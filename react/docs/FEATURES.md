# Fonctionnalités de shOsu! — comment elles marchent et comment elles doivent marcher

> **Règle** : toute modification ajoute ou met à jour la fiche correspondante, dans le même commit (voir [DEV-GUIDE.md](DEV-GUIDE.md) § Documenter).
> Les fiches décrivent l'état **actuel** ; l'historique des versions est dans `git log` (un commit par version « bêta X.Y »).

## Modèle de fiche (à copier)

```
### Nom de la fonctionnalité  (version d'apparition)
**But** — ce que ça apporte à l'utilisateur.
**Comment ça marche** — le flux, de l'action de l'utilisateur à l'écran.
**Doit fonctionner ainsi** — invariants à ne pas casser (comportements, sécurité, limites).
**Fichiers** — modules et composants.
**Données** — clés Redis / localStorage / caches (TTL).
**Limites** — débit, tailles, plans.
**Tester** — comment vérifier (local avec dev/, en production).
**Existe déjà / ne pas refaire** — recoupements avec d'autres fiches.
```

## Sommaire

1. [Authentification](#authentification) · 2. [Recherche](#recherche) · 3. [Suggestions « À découvrir »](#suggestions--à-découvrir) · 4. [Recherche par le son](#recherche-par-le-son-shazam-pour-osu)
5. [Stack (assistant IA)](#stack-assistant-ia) · 6. [Plans](#plans-gratuit-et-premium) · 7. [Listes](#listes-favoris-et-à-jouer-plus-tard) · 8. [Collections](#collections-personnalisées-et-partage)
9. [Export de liste](#export-dune-liste-en-un-seul-fichier) · 10. [Page d'une beatmap](#page-dune-beatmap) · 11. [Analyse de difficulté](#analyse-de-difficulté-par-mod) · 12. [Beatmaps similaires](#beatmaps-similaires)
13. [Profil joueur](#profil-joueur) · 14. [Recommandations « Pour toi »](#recommandations-pour-toi) · 15. [Historique](#historique) · 16. [Lecteur audio](#lecteur-audio) · 17. [Raccourcis clavier](#raccourcis-clavier)
18. [Navigation et mouvement](#navigation-et-mouvement) · 19. [Icône et identité](#icône-et-identité) · 20. [Caches et limites de débit](#caches-et-limites-de-débit)
21. [Mobile](#mobile-téléphone) · 22. [Chargement progressif](#chargement-progressif-des-résultats)
26. [Music DNA](#music-dna) · 27. [Similar Sound](#similar-sound-musique-proche) · 28. [Comparer deux beatmaps](#comparer-deux-beatmaps) · 29. [Partager une beatmap](#partager-une-beatmap-aperçus-de-liens)
23. [Suivi de progression (Progress Tracker)](#suivi-de-progression-progress-tracker) · 24. [Analyse des performances](#analyse-des-performances-et-points-faibles) · 25. [Mes statistiques](#mes-statistiques)

---

## Authentification

**But** — se connecter avec son compte osu! (sans mot de passe côté shOsu!) pour débloquer Stack, listes, collections, recommandations.
**Comment ça marche** — `/api/auth/login` appelle `auth.api.signInSocial` (fournisseur `osu`, scope `identify`, PKCE) et redirige vers osu! ; osu! revient sur `/api/auth/callback`
(route-alias qui relaie vers `/api/auth/callback/osu` de Better Auth). La session est un cookie chiffré (JWE, HttpOnly, SameSite=Lax, 7 jours) : aucune base de sessions.
`?switch=1` force `prompt=login` (changer de compte). Après connexion, `/` reçoit `?login=success` → bandeau `LoginNotice` (4 s). Le menu du compte (`components/account.tsx`) montre pseudo, badge plan, liens.
**Doit fonctionner ainsi** — l'e-mail est fabriqué `<osuId>@users.osu.invalid` (jamais saisi) ; `getUser` en tire `osuId`. Aucune permission au-delà de `identify`. `OSU_REDIRECT_URI` reste `…/api/auth/callback` (déjà enregistré chez osu!).
`AUTH_SESSION_VERSION` incrémenté = toutes les sessions invalidées. `GET /api/auth/check` (jeton `DIAGNOSTICS_TOKEN`) diagnostique l'OAuth ; sans jeton il répond 404.
**Fichiers** — `lib/auth.server.ts`, `lib/auth-client.ts`, `lib/session.server.ts`, `routes/api.auth.*.ts`, `components/account.tsx`, `components/login-notice.tsx`.
**Tester** — local : `/api/auth/login` (faux osu!). Production : le propriétaire se connecte.

## Recherche

**But** — chercher des beatmaps par titre, artiste, créateur, tags, avec filtres de mode et de statut.
**Comment ça marche** — `routes/home.tsx` appelle `GET /api/search?q&mode&status&cursor` (→ `searchBeatmapsets`, cache 60 s). osu! renvoie des pages avec un curseur ; l'interface filtre côté navigateur
(`matchesFilters`) et affiche les résultats en **défilement continu** (voir « Chargement progressif ») ; la page osu! suivante est demandée automatiquement au bout de la liste (`MAX_FILL_FETCHES = 5` pages tentées pour trouver au moins un résultat qui passe le filtre). Lien profond : `/?q=…&mode=…&status=…` lance la recherche (utilisé par Stack et l'historique).
Boutons : recherche, thème, micro (dictée), 🎧 (recherche par le son), 🗑 (effacer). Effet « ripple » sur les boutons d'action (`use-ripple.ts`).
**Doit fonctionner ainsi** — la recherche est publique (aucune connexion) ; les identifiants osu! restent côté serveur ; le tri n'accepte que la liste blanche `SEARCH_SORTS` ; `q` ≤ 200 caractères ; le curseur est validé par regex.
Chaque recherche aboutie est ajoutée à l'historique local (voir Historique).
**Limites** — 90 recherches/min/IP, compteur **par instance** (pas de Redis). Réponses publiques cachées 60 s au CDN (`s-maxage=60`, `stale-while-revalidate=300`).
**Fichiers** — `routes/home.tsx`, `routes/api.search.ts`, `lib/osu.server.ts` (`searchBeatmapsets`), `components/beatmap-card.tsx`, `lib/use-speech-recognition.ts`.
**Tester** — local : `/?q=camellia`. Le faux osu! filtre sur titre/artiste/tags.

## Suggestions « À découvrir »

**But** — proposer des beatmaps sous la barre de recherche tant qu'aucune recherche n'est affichée.
**Comment ça marche** — `lib/discover.server.ts` garde (10 min) les 40 premières beatmaps classées pour trois tris (`plays_desc`, `ranked_desc`, `favourites_desc`) et en mélange 18 à chaque visite (loader de `/`) ; la lentille « Surprends-moi » mélange les trois. `components/discovery.tsx` affiche 6 cartes à la fois, « Autres suggestions » fait défiler.
**Doit fonctionner ainsi** — aucune connexion requise ; si osu! échoue, la page s'affiche sans les suggestions (le loader attrape l'erreur).
**Fichiers** — `lib/discover.server.ts`, `components/discovery.tsx`, loader de `routes/home.tsx`.

## Recherche par le son (« Shazam pour osu! »)

**But** — faire écouter un extrait et retrouver ses beatmaps et des maps proches.
**Comment ça marche** — `components/listen-panel.tsx` enregistre le micro (MediaRecorder), `lib/audio.ts` décode et convertit en **WAV PCM 16 bits mono 16 kHz** (3 à 31 s). `POST /api/listen` (corps = WAV, flux NDJSON en réponse) :
`lib/listen.server.ts` valide l'en-tête WAV (`wavSeconds`), envoie l'audio à Gemini avec un schéma JSON (titre, artiste, ambiance, requêtes), cherche les beatmaps exactes (≤ 4) puis proches (≤ 8, ≤ 4 requêtes) et diffuse `status`/`delta`/`cards`/`done`.
Utilisé depuis l'accueil (🎧) et depuis Stack ; la page d'accueil affiche le résultat sous la grille (« RÉSULTAT DE L'ÉCOUTE »).
**Doit fonctionner ainsi** — connexion requise ; l'audio n'est jamais conservé ; seuls des WAV valides partent chez Gemini ; message d'erreur clair si Gemini est saturé (repli de modèle, chien de garde de 12 s au premier fragment).
Chaque écoute aboutie entre dans l'historique local.
**Limites** — 6 extraits / 10 min / joueur + limite globale (Redis partagé). Taille max `MAX_AUDIO_BYTES`.
**Fichiers** — `components/listen-panel.tsx`, `lib/audio.ts`, `lib/listen.server.ts`, `routes/api.listen.ts`, `lib/ndjson.server.ts`, `lib/stream-client.ts`.
**Tester** — le micro réel n'est pas testable dans le navigateur intégré ; en local on teste le câblage avec le faux Gemini.

## Stack (assistant IA)

**But** — un assistant conversationnel (panneau latéral) qui cherche, explique, recommande, consulte le compte osu! du joueur et agit sur la page.
**Comment ça marche** — `components/assistant.tsx` envoie l'historique (≤ 12 tours) à `POST /api/assistant` ; `lib/assistant.server.ts#runAssistant` boucle (≤ 5 tours de modèle, ≤ 6 appels d'outils) : le modèle (Gemini via `gemini.server.ts#streamContent`, avec appels d'outils)
réclame des outils, **exécutés par le serveur**, dont les résultats retournent au modèle. Le flux NDJSON (`status|delta|cards|players|link|action|done|error`, type `StreamEvent` dans `lib/assistant.ts`) est lu par `lib/stream-client.ts#readEvents`.
Les `cards` (beatmaps) et `players` s'affichent sous le texte ; les `action` (ouvrir recherche/beatmap/profil, `lists_changed`) sont **revalidées** côté navigateur (`actionUrl`). La conversation vit dans `sessionStorage` (`stack-chat-v2`, 30 messages).
Voix : dictée (Web Speech) et écoute 🎧. Suggestions de départ : `SUGGESTIONS` dans `lib/assistant.ts`.
**Outils** (déclarés dans `TOOLS`, exécutés dans `execute`) :

| Outil | Rôle |
| --- | --- |
| `search_beatmaps` | recherche (mots-clés, mode, statut, étoiles min/max) → cartes |
| `get_player_profile` | profil public anonymisé du joueur connecté (pp, rang, 25 meilleurs scores, dérivés) |
| `get_beatmap` | détails d'un set (difficultés CS/AR/OD/HP, tags…) |
| `find_player`, `get_rankings` | joueur par pseudo ; classement mondial/pays (10 par page, `limit`) |
| `get_my_account`, `get_my_scores`, `get_my_beatmaps`, `get_my_activity` | **toutes les données publiques du compte** (`lib/account.server.ts`) : stats des 4 modes, rang sur 90 j, badges, succès, groupes, kudosu, parties/mois ; scores best/recent/firsts/pinned ; beatmaps favourite/most_played/ranked/loved/pending/graveyard/guest/nominated ; activité |
| `get_recommendations` | recommandations selon les habitudes (voir « Pour toi ») |
| `find_similar_maps`, `analyze_difficulty` | beatmaps proches ; difficulté par mod |
| `get_my_lists`, `add_to_list`, `remove_from_list` | listes favorites/later (3 modifications max par message, liste blanche d'ids déjà affichés) |
| `get_my_collections`, `create_collection`, `add_to_collection` | collections (mêmes garde-fous ; exige Redis persistant) |
| `show_in_search`, `open_beatmap`, `open_player` | actions de navigation |

**Doit fonctionner ainsi** — connexion requise ; jamais de donnée inventée : il ne cite que ce que renvoient les outils ; les résultats d'outils et messages sont des **données**, pas des instructions (injection) ; il ne modifie les listes que sur demande explicite et pour des beatmaps déjà affichées (`known`/`knownIds`) ;
il n'a accès qu'à des données **publiques** (la connexion n'a que `identify` : ni amis, ni messages, ni e-mail — il doit le dire franchement) ; texte brut (pas de Markdown/HTML).
**Ajouter un outil** : déclarer dans `TOOLS` (schéma `GeminiSchema`), ajouter son texte d'état dans `STATUS_TEXT`, son `case` dans `execute` (valider les arguments avec `clean`, `intId`, `boundedInt`, `modeOf`), le citer dans `SYSTEM`, documenter ici.
**Limites** — messages par fenêtre de 10 min selon le plan (20 gratuit / 100 premium) + limite globale partagée ; réponse ≤ 3000 caractères ; modèles de repli si saturation.
**Animations** (`assistant.css`) : panneau à ressort, messages qui glissent depuis leur côté, mots qui apparaissent en fondu pendant le flux (`StreamedText`), curseur lumineux, points en vague, état qui brille, cartes en cascade, halo de l'avatar quand `data-busy`. Tout est coupé sous `prefers-reduced-motion`.
**Fichiers** — `components/assistant.tsx`, `assistant.css`, `lib/assistant.ts`, `lib/assistant.server.ts`, `lib/gemini.server.ts`, `lib/account.server.ts`, `routes/api.assistant.ts`, `lib/stream-client.ts`, `lib/ndjson.server.ts`.
**Tester** — local : faux Gemini + `[tool:nom {json}]` ; relire `dev/tool-responses.log`.

## Plans (Gratuit et Premium)

**But** — limiter l'usage de Stack et la taille des listes tout en gardant **le site entièrement gratuit** (aucun paiement prévu).
**Comment ça marche** — `lib/plans.ts` définit les limites (`PLANS` : messages Stack/10 min, taille de liste/collection, nombre de collections). `lib/plans.server.ts#getPlan(osuId)` (cache 60 s) lit d'abord `PREMIUM_USER_IDS`, puis `shosu:plans` (Redis) ; toute erreur ou doute → `free`.
`/api/admin/plan` (GET/POST, `ADMIN_TOKEN` ≥ 24 car., comparaison à temps constant, 30 essais/min/IP, 404 sans jeton) attribue un plan avec durée optionnelle. Page `/premium` : comparaison.
**Doit fonctionner ainsi** — le plan est lu **côté serveur** uniquement ; jamais d'avantage donné en cas d'erreur. Modifier les limites **à un seul endroit** (`plans.ts`) et mettre à jour `routes/premium.tsx` et la table du README.
**Fichiers** — `lib/plans.ts`, `lib/plans.server.ts`, `routes/api.admin.plan.ts`, `routes/premium.tsx`, badge dans `components/account.tsx`.
**Limites actuelles** — Gratuit : 20 msg Stack/10 min, 200 beatmaps/liste, 5 collections. Premium : 100, 1000, 25. Premium attribués : ids `37954459` et `38656812` via `PREMIUM_USER_IDS`.

## Listes (favoris et « à jouer plus tard »)

**But** — garder des beatmaps sous la main (♡ favoris, 🕒 à jouer plus tard).
**Comment ça marche** — `components/list-buttons.tsx` (boutons sur chaque carte et page de beatmap) appelle `lib/lists-context.tsx#toggle` : mise à jour optimiste puis `POST /api/lists {action: add|remove, list, id}`. `GET /api/lists` renvoie les ids présents (colore les boutons).
`lib/lists.server.ts#addToList` relit les métadonnées chez osu! (`fetchSlim`) — **jamais fournies par le navigateur** — et les range dans le hash Redis. Page `/lists` (`routes/lists.tsx`) : onglets favoris / later / collections, compteur « n / limite », « Afficher plus » par 60.
**Doit fonctionner ainsi** — connexion requise ; POST vérifié (origine, auth, 300 écritures/10 min, corps ≤ 500 octets) ; liste pleine → 409 `list_full` ; une beatmap déjà présente peut être « réajoutée ».
**Données** — `shosu:u:<osuId>:favorites|later` (hash id → JSON allégé + `addedAt`).
**Fichiers** — `lib/lists.ts`, `lib/lists.server.ts`, `lib/lists-context.tsx`, `routes/api.lists.ts`, `routes/lists.tsx`, `components/list-buttons.tsx`.

## Collections personnalisées et partage

**But** — listes nommées, créées par le joueur, partageables par lien (publiques) ; peuvent être copiées par d'autres joueurs.
**Comment ça marche** — bouton 📁 (`components/collection-menu.tsx`, fenêtre rendue dans `<body>`) : cases à cocher, création rapide. `/lists?list=collections` : créer et ouvrir ses collections. `/collection/:id` (`routes/collection.$id.tsx`) :
propriétaire → renommer, supprimer, retirer une carte, bouton **Partager** (rend publique ; boîte avec lien, « Copier », `navigator.share`) ; visiteur → voir, exporter, **copier** dans ses collections (connexion requise). `lib/collections.server.ts` porte la logique ; `routes/api.collections.ts` l'API (`create|rename|share|delete|add|remove|clone`).
**Doit fonctionner ainsi** — l'id de collection est aléatoire (10 caractères sans i/l/o/0/1) et **sert de lien de partage** ; une collection privée est **404 pour tout autre que son propriétaire** ; une collection publique est lisible mais jamais modifiable par un autre ; `ownedBy` contrôle la propriété avant toute écriture ;
`clone` n'accepte que publique ou à soi ; les métadonnées des beatmaps viennent d'osu! ; les écritures exigent Redis persistant (`storage_not_persistent` sinon) ; page publique limitée à 60 requêtes/min/IP **par instance**.
**Données** — `shosu:cols:<osuId>` (id → méta : nom ≤ 60, description ≤ 200, `public`, `count`, dates, propriétaire), `shosu:col:<id>` (items), `shosu:colidx` (id → osuId).
**Limites** — 5 / 25 collections ; 200 / 1000 beatmaps par collection ; 200 écritures / 10 min / joueur (Redis partagé).
**Fichiers** — `lib/collections.ts` (types, `cleanName`, regex d'id), `lib/collections.server.ts`, `lib/collections-client.ts` (appels + messages d'erreur), `routes/api.collections.ts`, `routes/collection.$id.tsx`, `routes/lists.tsx`, `components/collection-menu.tsx`.
**Tester** — local : créer, ajouter, partager, puis `curl localhost:5173/collection/<id>` sans cookie (200 si publique, 404 sinon).

## Export d'une liste en un seul fichier

**But** — emporter une liste (favoris, later, collection) dans un fichier.
**Comment ça marche** — `components/export-menu.tsx` → `lib/export.ts#buildExport` fabrique le fichier **dans le navigateur** (rien n'est envoyé) : `.html` « téléchargeur » autonome (choix de miroir, lance les téléchargements un par un toutes les 2,5 s ; miroirs : Beatconnect, Mino, Nerinyan, osu! officiel, `osu://`), `.txt`, `.csv` (BOM Excel, garde contre l'injection de formules), `.json` (sauvegarde).
**Doit fonctionner ainsi** — shOsu! n'héberge ni ne relaie aucune beatmap ; tout texte injecté est **échappé** (titre HTML via `escapeHtml`, données JSON avec `<` échappé, CSV protégé) ; ne jamais auto-lancer de téléchargement sans geste de l'utilisateur.
**Fichiers** — `lib/export.ts`, `components/export-menu.tsx`.
**Tester** — générer des fichiers avec des titres hostiles (`</script><img onerror=…>`) et vérifier qu'aucun HTML n'est interprété.

## Page d'une beatmap

**But** — tout savoir sur un set : cover, BPM, durée, favoris, tags, difficultés, actions.
**Comment ça marche** — `routes/beatmap.$id.tsx` (loader → `getBeatmapset`, cache 5 min) : en-tête, actions (écouter, `osu://`, osu.ppy.sh, listes, collection, « Expliquer avec Stack »), tuiles, puces de tags, courbe des difficultés, liste dépliable des difficultés (voir Analyse), beatmaps similaires.
**Doit fonctionner ainsi** — 404 si l'id n'existe pas chez osu! ; 502 si osu! est indisponible ; l'id est validé (`^\d{1,10}$`).

## Analyse de difficulté par mod

**But** — savoir comment une difficulté change avec EZ, HR, HT, DT, DT+HR, FL.
**Comment ça marche** — clic sur une difficulté → `components/difficulty-analysis.tsx` appelle `GET /api/analysis?id=<id de difficulté>` → `lib/analysis.server.ts#analyzeDifficulty` : `getDifficulty` (`GET /beatmaps/{id}`) puis, pour chaque combinaison, `POST /beatmaps/{id}/attributes {mods, ruleset}` (étoiles, aim, vitesse…).
AR/OD/CS/HP/BPM/durée sont **calculés** par `lib/mods.ts#applyMods` (formules d'osu! ; AR 9 + DT = 10,33, HR plafonne à 10) ; en dehors du mode standard seules les étoiles, le BPM et la durée varient. `profile` : aim/vitesse ≥ 1,18 → « aim », ≤ 0,95 → « vitesse ».
**Doit fonctionner ainsi** — une seule analyse ouverte à la fois ; échec d'un mod → la ligne manque mais la page reste utilisable ; échec total → message ; cache serveur 1 h, CDN 10 min.
**Limites** — 20 analyses/min/IP par instance. **Fichiers** — `lib/analysis.server.ts`, `lib/mods.ts`, `lib/insights.ts` (types), `routes/api.analysis.ts`, `components/difficulty-analysis.tsx`.
**Outil Stack** — `analyze_difficulty`. **Tester** — `lib/mods.ts` se teste avec `node` (voir DEV-GUIDE) ; en production `curl https://shosure.vercel.app/api/analysis?id=75`.

## Beatmaps similaires

**But** — trouver des maps proches d'une beatmap.
**Comment ça marche** — `components/similar-maps.tsx` appelle `GET /api/similar?id=<set>` → `lib/similar.server.ts#findSimilar` : recherches osu! autour de l'artiste, de la source et de 2 tags distinctifs (`usefulTags`), candidats classés par `lib/similar.ts#scoreSimilarity`
(même artiste 34, source 12, tags communs ≤ 26, BPM ≤ 14, difficulté ≤ 14, mappeur 5, genre 4, langue 3 ; modes en commun obligatoires ; seuil 22/100) avec raisons lisibles. Carte commune : `components/map-match-card.tsx`.
**Deux modes** (`focus`, onglets « Globale » / « 🎵 Musique proche » sur la page) : voir la fiche *Similar Sound*.
**Doit fonctionner ainsi** — résultats publics (CDN 5 min), ≤ 12, jamais la beatmap elle-même ; échec de certaines recherches tolérée.
**Limites** — 40/min/IP par instance. **Outil Stack** — `find_similar_maps`.

## Profil joueur

**But** — page publique d'un joueur : rangs, pp, précision, niveau, temps de jeu, grades, 25 meilleurs scores, par mode.
**Comment ça marche** — `routes/player.$id.tsx` (id numérique ou pseudo, `parsePlayerRef`) → `getPlayerPage(ref, mode)` (cache 5 min). Onglets de mode via `?mode=`.
**Doit fonctionner ainsi** — un mode sans partie **n'est pas une erreur** : `hasStats` est faux (aucune partie, pp nul, pas de rang) → carte « Pas encore de statistiques en <mode> » au lieu de zéros ; si osu! refuse la variante par mode (404) on lit le profil général ; un échec de lecture des scores laisse la page s'afficher sans la liste. 404 si le joueur n'existe pas.
**Contenu (de haut en bas)** — héros, onglets de mode, tuiles de stats, **Suivi de progression**, **Analyse des performances** (ces deux sections n'apparaissent que si `hasStats`), 25 meilleurs scores.
**Fichiers** — `routes/player.$id.tsx`, `lib/osu.server.ts#getPlayerPage`, `lib/osu.ts` (types `PlayerPage`, `TopPlay`).

## Recommandations « Pour toi »

**But** — proposer des beatmaps d'après les habitudes de jeu du joueur.
**Comment ça marche** — accueil, une fois connecté, sans recherche affichée : `components/recommendations.tsx` appelle `GET /api/recommendations[?mode]` → `lib/recommend.server.ts#getRecommendations(osuId, mode)` (cache 15 min par joueur+mode) :
lit ses 100 meilleurs scores, 50 scores récents, beatmaps les plus jouées et favoris (osu!), en déduit une zone de difficulté (quartiles), BPM et durée médians, mods, artistes (pondérés) et tags (favoris) ; cherche autour des artistes/tags + un pool de populaires ; garde les maps dont une difficulté tombe dans la zone (un peu au-dessus de la médiane) ;
score = difficulté (≤ 40) + artiste (≤ 28) + tags (≤ 18) + BPM (≤ 12) + durée (≤ 6) + popularité (≤ 8) ; exclut tout ce qui est déjà joué/favori ; ≤ 2 par artiste, 12 résultats ; chaque carte donne ses raisons.
**Doit fonctionner ainsi** — réponse propre au joueur : `Cache-Control: private, no-store` ; sans score dans le mode → `habits: null` + message ; mode principal lu via `/users/{id}` si non précisé.
**Limites** — 12/10 min/joueur par instance. **Outil Stack** — `get_recommendations`. **Fichiers** — `lib/recommend.server.ts`, `routes/api.recommendations.ts`, `components/recommendations.tsx`, `lib/insights.ts`.

## Historique

**But** — retrouver ses recherches, écoutes et beatmaps consultées récentes.
**Comment ça marche** — `lib/history.tsx` (`HistoryProvider` dans `layout.tsx`, clé `localStorage` `shosu-history-v1:<osuId|guest>`) : ≤ 30 recherches (dédoublonnées), ≤ 15 écoutes (résumé + 4 beatmaps), ≤ 40 **beatmaps consultées** (`views`, dédoublonnées, la dernière en tête ; enregistrées à l'ouverture de `/beatmap/:id`, une fois l'historique lu). `home.tsx` enregistre chaque recherche réussie et chaque écoute ; Stack enregistre ses écoutes une fois la réponse complète.
Affichage : puces « Récent » sous la barre de recherche (accueil au repos), page `/history` (onglets Recherches / Consultées / Écoutes, « Tout effacer », suppression unitaire), lien dans le menu du compte. Les consultations alimentent **Music DNA** (le navigateur en envoie jusqu'à 20 identifiants).
**Doit fonctionner ainsi** — **100 % local** : rien n'est envoyé au serveur ni stocké dans Redis (0 commande) ; un historique par compte osu! ; synchronisation entre onglets via l'événement `storage` ; les écritures avant la première lecture ne doivent jamais écraser l'existant.
**Fichiers** — `lib/history.tsx`, `routes/history.tsx`, `routes/home.tsx`, `components/assistant.tsx`.

## Lecteur audio

**But** — écouter les aperçus de beatmaps, une piste à la fois pour tout le site.
**Comment ça marche** — `lib/player.tsx` (`PlayerProvider`, `usePlayer`) porte l'élément audio ; `components/player-bar.tsx` : barre fixe en bas (cover, titre, ⏮ ▶/⏸ ⏭, position, volume mémorisé) dès qu'une piste joue ; une file (`queue`) s'enchaîne. Aperçus : `https://b.ppy.sh/preview/<fichier>`.
**Fichiers** — `lib/player.tsx`, `components/player-bar.tsx`, boutons ▶ des cartes. `body.has-player` ajoute une marge basse.

## Raccourcis clavier

`lib/use-shortcuts.ts` : `/` recherche · `S` Stack · `Espace` lecture/pause · `Échap` fermer Stack. Jamais actifs pendant une saisie.

## Navigation et mouvement

- **Bouton Retour** (`components/back-button.tsx`) : sur toute page sauf `/` ; revient en arrière si la page précédente est dans shOsu! (`location.key !== "default"`), sinon mène à l'accueil ; sans JavaScript c'est un lien vers `/`.
- **Entrée de page** : `main` est remonté à chaque chemin (`key={pathname}`) et ses enfants montent l'un après l'autre (`.page-enter`). **Cascade** des cartes, tuiles, lignes ; réactions au toucher ; lecteur qui glisse.
- Courbes `--ease-out` / `--ease-spring` dans `motion.css` ; tout est désactivé sous `prefers-reduced-motion: reduce`. Les squelettes de chargement (`.skeleton`) sont dans `pages.css`.

## Icône et identité

- Icône : `public/icon.svg` (anneaux roses et étincelle, **recréation vectorielle** de l'image fournie par le propriétaire, dont le « fond transparent » était un damier dessiné dans l'image — un détourage propre était impossible) ; PNG dérivés `icon-192.png`, `icon-512.png`, `favicon-32.png`, `favicon-48.png`, `apple-touch-icon.png` (opaque), `shosu.png` ; `site.webmanifest`.
- Branchée dans `root.tsx` (`<link rel="icon">`, apple-touch, manifest, `theme-color`) et comme **logo du header** (`<img className="brand-mark" src="/icon.svg">` dans `layout.tsx`, style dans `motion.css`).
- Pour régénérer les PNG : rendre `icon.svg` avec `sharp` aux tailles voulues.
- Logo de Stack : `public/stack.jpeg` (distinct de l'icône du site).

## Caches et limites de débit

| Donnée | Cache serveur (mémoire, par instance) | CDN |
| --- | --- | --- |
| Recherche | 60 s | `s-maxage=60`, swr 300 |
| Beatmapset, profil joueur, classement | 5 min | — |
| Suggestions « À découvrir » | 10 min | — |
| Similaires | 10 min | `s-maxage=300` |
| Analyse de difficulté | 1 h | `s-maxage=600` |
| Recommandations (par joueur) | 15 min | jamais (privé) |
| Compte osu! (Stack) | 2–5 min | jamais |
| Plan d'un joueur | 60 s | — |

Limites de débit (`lib/rate-limit.server.ts`, fenêtre fixe) : partagées via Redis pour Stack, écoute, listes, collections, admin ; **par instance** (0 commande Redis) pour recherche, similaires, analyse, recommandations, page de collection.

## Mobile (téléphone)

**But** — shOsu! doit être agréable au pouce sur un téléphone (≤ 700 px).
**Comment ça marche** — tout se règle dans `app/mobile.css` (importé **en dernier** par `app.css`) plus deux composants :
- **Barre du bas** `components/mobile-nav.tsx` (affichée seulement sous 700 px) : Accueil · Recherche (met le focus dans le champ, en allant à l'accueil si besoin) · Listes · Stack · Profil (ou Connexion). Le header est allégé : « Listes » et « Stack » y disparaissent (la barre les porte), le menu du compte ne garde que l'avatar.
- **Cartes compactes** : cover 92 px à gauche, titre/étoiles à droite, une seule rangée d'actions dessous (`Détails` + ♡ 🕒 📁 ▶, 40 px chacun). Le lien « Voir le beatmap ↗ » (osu.ppy.sh) est masqué : la page `Détails` le reprend. Le bouton ▶ garde un `aria-label` (« Écouter l'aperçu de … »).
- **Cibles tactiles ≥ 40 px**, champs à 16 px (évite le zoom automatique d'iOS), onglets et puces de « récent » défilant horizontalement, filtres sur deux colonnes (libellé | liste).
- **Lecteur** (`player-bar`) : deux rangées au-dessus de la barre du bas (cover, titre, ⏮ ▶ ⏭ de 44 px, ✕ ; puis curseur de position pleine largeur) ; le volume est masqué (boutons du téléphone).
- **Stack en feuille** : sous 700 px le panneau monte du bas (84 % de la hauteur, coins arrondis, poignée), avec un **voile** (`.assistant-scrim`) qui ferme au toucher ; on le ferme aussi en **tirant l'en-tête vers le bas** (> 90 px, gestes `touch*` dans `assistant.tsx`) ; suggestions en rangée défilante, note masquée pour gagner de la place. La page derrière reste visible.
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` : encoches et barre d'accueil iOS respectées.
**Doit fonctionner ainsi** — sur ≥ 701 px **rien ne change** (la barre du bas et le voile sont `display: none`) ; ne pas dupliquer ces règles dans `pages.css`/`legacy.css` ; toute nouvelle page doit être vérifiée à 375 px (pas de défilement horizontal, cibles ≥ 40 px) et laisser ~76 px en bas pour la barre.
**Fichiers** — `app/mobile.css`, `components/mobile-nav.tsx`, `routes/layout.tsx` (monte `MobileNav`), `components/assistant.tsx` (voile, balayage), `components/account.tsx` (classe `account-lists`), `components/beatmap-card.tsx`.
**Tester** — navigateur à 375×812 (outil de redimensionnement) : accueil, recherche, lecteur, Stack, une page de beatmap, un profil, `/lists`.

## Chargement progressif des résultats

**But** — des listes longues sans attente ni pagination manuelle, surtout sur téléphone.
**Comment ça marche** — `lib/use-progressive.ts#useProgressive(total, step, resetKey, onEnd)` : montre `step` éléments (18 sur l'accueil, 24 sur `/lists`), en ajoute autant quand une **sentinelle** (`.load-more`, placée après la grille, `IntersectionObserver` avec 700 px d'avance) approche de l'écran ; au bout de la liste appelle `onEnd` (accueil : demander la page osu! suivante avec le curseur ; `loadMore` ajoute à `allResults`). Pendant l'attente, 2 squelettes (`.card-skeleton`) ; le bouton « Charger plus » reste affiché en secours (accessibilité, navigateurs sans IntersectionObserver).
**Doit fonctionner ainsi** — une nouvelle recherche/écoute remet le compteur à zéro (`resetKey`) ; `loadMore` ne tourne jamais en parallèle (`loadingMore`) ; plus de boutons Précédent/Suivant ; la file du lecteur = les cartes visibles.
**Fichiers** — `lib/use-progressive.ts`, `routes/home.tsx`, `routes/lists.tsx`, styles dans `mobile.css` (.load-more, .load-more-btn, .card-skeleton), `.skeleton` dans `pages.css`.

## Suivi de progression (Progress Tracker)

**But** — suivre l'évolution d'un joueur : pp, rang, précision, parties, par mode (demandé « dans le profil »).
**Comment ça marche** — `components/progress-tracker.tsx` (sur le profil de **n'importe quel joueur** et sur `/stats`) appelle `GET /api/progress?player=<id osu!>&mode=<mode>` → `lib/progress.server.ts#getProgress` :
- lit `/users/{id}/{mode}` pour les 4 modes (cache 5 min) : stats actuelles, **`rank_history`** (rang mondial des ~90 derniers jours), **`monthly_playcounts`** (parties par mois) ;
- lit les **relevés shOsu!** dans Redis ;
- calcule les variations : rang 7/30 j (depuis `rank_history`, négatif = a progressé), pp/parties/précision 7/30 j (depuis les relevés, avec un recul toléré de 10 jours).
Affichage : tuiles de variation (vert = progrès), courbe du rang (axe inversé : un meilleur rang est plus haut), barres des parties par mois, courbes **pp** et **précision** (si ≥ 2 relevés), **« Modes préférés »** (part des parties par mode).
**Relevés shOsu! (pourquoi)** — osu! ne fournit pas l'historique des pp ni de la précision : on le construit jour après jour. Un relevé = `{pp, rank, accuracy, plays}` par mode joué, écrit dans `shosu:snap:<osuId>` (champ `<mode>:<AAAA-MM-JJ>`) par `recordSnapshot(osuId)`.
Déclencheurs : (1) `layout.tsx` fait `POST /api/progress` **au plus une fois par jour et par navigateur** (clé `localStorage` `shosu-snapshot:<osuId>`) pour le joueur connecté ; (2) l'outil Stack `get_my_account`. Ménage : ~10 % des écritures suppriment les relevés de plus de 120 jours.
**Doit fonctionner ainsi** — **jamais d'écriture déclenchée par une consultation anonyme** : `recordSnapshot` n'est appelé que pour le joueur connecté lui-même (origine vérifiée, 6/h) ; un joueur jamais connecté à shOsu! n'a pas de courbes pp/précision (message explicatif) mais garde rang 90 j et parties/mois ;
Redis indisponible → le reste du suivi s'affiche quand même ; le rang `0` d'osu! (non classé) devient `null` (trou dans la courbe).
**Limites** — GET : 40/min/IP par instance, CDN 5 min ; POST : 6/h/joueur. Coût Redis : 1 lecture (HGETALL) par appel non servi par le CDN ; ~4 écritures par jour et par joueur connecté.
**Fichiers** — `lib/progress.server.ts`, `routes/api.progress.ts`, `components/progress-tracker.tsx`, `components/charts.tsx` (`LineChart`, `BarChart` SVG sans dépendance, animés, `role="img"` + résumé), `lib/insights.ts` (types `ProgressData`…), `lib/store.server.ts` (`hash.setMany`).
**Outil Stack** — `get_my_progress`. **Tester** — local : ouvrir `/stats` (rang et parties viennent du faux osu!) ; `fetch('/api/progress',{method:'POST'})` crée un relevé (clé `shosu:snap:38656812` visible via `localhost:4030/stats`).

## Analyse des performances et points faibles

**But** — dire au joueur où il perd des points et comment progresser.
**Comment ça marche** — `components/performance-analysis.tsx` appelle `GET /api/performance?player=&mode=` → `lib/performance.server.ts#analyzePerformance` : lit les 100 meilleurs scores et les 100 derniers (échecs compris), les range par tranche de difficulté, de BPM et par groupe de mods, puis des **règles** (pas un modèle) produisent des constats (`PerformanceFinding`, `strength|weakness`, avec `advice` pour les faiblesses) :
précision en baisse dans une tranche (≥ 1,2 pt sous la moyenne, ≥ 4 scores) · forte tranche (+0,8) · échecs récents ≥ 35 % dans une tranche (≥ 5 parties) · BPM le moins précis (−1 pt) · DT très rentable / sans mod peu rentable · précision HD ≥ 1,5 pt sous le sans mod · misses moyens ≥ 3 (ou ≤ 0,6 : jeu propre) · jeu récent < médiane − 1★. Maximum 8 constats ; moins de 10 scores → message « pas assez de scores ».
**Doit fonctionner ainsi** — calcul déterministe et explicable : toute nouvelle règle précise son seuil dans le détail affiché ; aucune donnée privée (scores publics) ; cache serveur 10 min, CDN 10 min.
**Limites** — 20/min/IP par instance. **Fichiers** — `lib/performance.server.ts`, `routes/api.performance.ts`, `components/performance-analysis.tsx`, types `PerformanceAnalysis` dans `lib/insights.ts`. **Outil Stack** — `analyze_performance`.

## Mes statistiques

**But** — tableau de bord personnel (`/stats`, menu du compte « Mes statistiques »).
**Contenu** — onglets de mode ; **Suivi de progression** (voir plus haut, `isMe`) ; **Analyse des performances** ; **Mon activité sur shOsu!** : nombre de favoris, « à jouer plus tard » (`lists.count`), collections (dont partagées, via `GET /api/collections`), recherches et écoutes (historique local).
**Doit fonctionner ainsi** — hors connexion : invitation à se connecter ; les compteurs de recherches/écoutes sont locaux au navigateur (le dire) ; lien vers le profil public.
**Fichiers** — `routes/stats.tsx`, `lib/lists-context.tsx` (`count`), `components/account.tsx`.

## Music DNA

**But** — créer l'**empreinte musicale** du joueur à partir des beatmaps qu'il aime, joue et consulte, puis trouver des morceaux qui lui correspondent (page `/dna`, menu du compte, outil Stack `music_dna`).
**Comment ça marche** — `routes/dna.tsx` envoie `POST /api/dna {viewed: [≤ 20 ids]}` (les consultations viennent de l'historique **local**, donc c'est le navigateur qui les fournit) → `lib/dna.server.ts#getMusicDna(osuId, viewed)` :
1. rassemble des beatmaps avec un **poids** : favoris osu! (3), favoris shOsu! (3), « à jouer plus tard » shOsu! (1,5), consultées (2), les plus jouées osu! (1 à 3 selon le nombre de parties) ;
2. garde les 40 plus pesantes, lit leurs détails (`getBeatmapset`, 8 à la fois) : genre, langue, BPM, tags, artiste, durée ;
3. agrège (pondéré) en **signature** : genres et langues (parts), histogramme de BPM (classes de 20), BPM moyen et mot de tempo (lent < 120 · médium · rapide ≥ 160 · très rapide ≥ 200), artistes et tags dominants, phrase de résumé en français ;
4. cherche autour des 2 premiers artistes, 3 premiers tags et du genre principal, **exclut tout ce que le joueur connaît déjà**, et classe les candidats (genre ≤ 22, langue ≤ 10, tempo ≤ 22, tags ≤ 28, artiste de l'ADN 14, popularité ≤ 4 ; seuil 25 ; ≤ 2 par artiste ; 12 résultats).
**Doit fonctionner ainsi** — propre au joueur connecté : `private, no-store`, POST vérifié (origine, auth, corps ≤ 600 o), 8 calculs / 10 min / joueur **par instance** (0 Redis hors lecture des listes), cache serveur 15 min par (joueur, consultations) ; aucune donnée → `dna: null` + message ; les sources qui échouent sont ignorées (le calcul continue avec le reste).
**Fichiers** — `lib/dna.server.ts`, `routes/api.dna.ts`, `routes/dna.tsx`, `lib/insights.ts` (`MusicDna`), `components/map-match-card.tsx`, `components/charts.tsx`. **Genres favoris / modes préférés** : barres « Genres » et « Langues » de cette page ; « Modes préférés » dans le Suivi de progression.
**Tester** — local : `/dna` (faux favoris et parties les plus jouées).

## Similar Sound (musique proche)

**But** — trouver des beatmaps dont la **musique** est proche (même artiste, BPM similaire, genre, langue, ambiance), sans tenir compte de la difficulté.
**Comment ça marche** — `scoreSimilarity(base, other, "sound")` dans `lib/similar.ts` : artiste 38, source 14, tags ≤ 30, **BPM ≤ 22 avec tolérance 12 %**, genre 12, langue 8 ; ni difficulté ni mappeur ; seuil 26. `findSimilar(setId, focus)` (`similar.server.ts`) cherche autour de l'artiste, de la source et de 3 tags ; `GET /api/similar?id=&focus=sound` ; onglets sur la page d'une beatmap ; outil Stack `similar_sound`. Genre et langue des candidats : noms fournis par osu! ou déduits de `genre_id`/`language_id` (tables `GENRES`/`LANGUAGES`).
**Doit fonctionner ainsi** — le mode « mix » (défaut) reste inchangé ; les raisons affichées expliquent chaque score ; mêmes limites que les similaires (40/min/IP par instance, CDN 5 min, clé de cache `similar:<id>:<focus>`).

## Comparer deux beatmaps

**But** — comparer deux sets côte à côte (difficulté, tempo, durée, popularité, ressemblance musicale).
**Comment ça marche** — `/compare?a=<set>&b=<set>` (`routes/compare.tsx`, bouton « ⚖ Comparer » sur la page d'une beatmap) : le loader lit les deux sets (`getBeatmapset`, cache 5 min) et `lib/compare.ts#compareSets` (fonction **pure**, partagée avec Stack) produit : tableau (difficulté max/min, nombre de difficultés, BPM, durée, combo/AR/OD/CS/HP de la plus dure, favoris, parties, genre, langue, statut, mappeur — la valeur la plus haute est mise en avant, sans jugement « mieux »), % de ressemblance musicale, et un **verdict** en phrases.
Avec seulement `a`, la page propose 6 beatmaps proches à comparer ; les champs acceptent un identifiant **ou** un lien `osu.ppy.sh/beatmapsets/…` ; bouton « Inverser ».
**Doit fonctionner ainsi** — identifiants validés (`^\d{1,10}$`), erreurs affichées dans la page (set inexistant, osu! indisponible) sans planter ; 40 requêtes/min/IP par instance. **Outil Stack** — `compare_beatmaps`.
**Fichiers** — `lib/compare.ts`, `routes/compare.tsx`, styles `compare-*` dans `pages.css`.

## Partager une beatmap (aperçus de liens)

**But** — envoyer un lien shOsu! vers une beatmap (ou une collection, un profil) qui s'affiche bien dans Discord, messageries, réseaux.
**Comment ça marche** — `components/share-button.tsx` (« 🔗 Partager » sur `/beatmap/:id`) : sur appareil tactile ouvre la feuille de partage du système (`navigator.share`), sinon copie `<origine>/beatmap/<id>` ; message de confirmation « ✓ Lien copié ». Les `meta` de `beatmap.$id.tsx`, `collection.$id.tsx` et `player.$id.tsx` fournissent `og:title`, `og:description`, `og:image` (cover de la beatmap, première cover d'une collection, avatar du joueur) et `twitter:card`.
**Doit fonctionner ainsi** — le lien est toujours `window.location.origin + chemin du site` (jamais une URL fournie par un tiers) ; les collections privées n'ont aucune méta (404).
