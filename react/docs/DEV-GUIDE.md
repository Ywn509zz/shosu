# Guide de développement

## Lancer en local

```bash
cd react
npm install
./dev/dev.sh        # faux osu!, faux Gemini, faux Redis + serveur de dev sur http://localhost:5173
./dev/stop.sh       # arrête tout
```

`dev/dev.sh` ne demande **aucun secret**. Ouvre http://localhost:5173/api/auth/login : tu es connecté en « Vinncent » (osu id 38656812) par le faux osu!.
Pour essayer le plan Premium : `PREMIUM_USER_IDS=38656812 ./dev/dev.sh`. Détails des faux services dans [`../dev/README.md`](../dev/README.md).

Avec de vrais secrets (rarement utile) : copier `.env.example` vers `.env`. Les secrets de production sont « sensibles » sur Vercel : on ne peut pas les relire.

Vérifications avant de publier :

```bash
npx tsc --noEmit        # types (doit être vide)
npm run build           # build de production
```

Formatage : Prettier avec `--print-width 120` sur les fichiers qu'on crée (certains fichiers anciens ne sont pas formatés ; ne pas reformater ce qu'on ne touche pas).

## Tester une fonctionnalité

1. **Logique pure** (similarité, formules de mods…) : modules sans import (`similar.ts`, `mods.ts`) ; on les exécute avec `node fichier.mts` (Node 24+ sait lancer du TypeScript).
2. **API** : avec le serveur local lancé, `curl localhost:5173/api/...` pour les routes publiques ; pour les routes connectées, ouvrir la page dans le navigateur (connecté) et appeler `fetch('/api/...')` depuis la console / un outil de navigateur.
3. **Stack** : le faux Gemini déclenche un outil quand le message contient `[tool:nom_outil {"arg":1}]` (ex. `[tool:get_my_account]`), puis répond en flux. Les réponses des outils sont écrites dans `dev/tool-responses.log` pour être relues.
4. **Interface** : naviguer avec un vrai navigateur ; vérifier aussi en largeur mobile (375 px) et en thème clair.
5. **Production** : après le push, attendre que `https://shosure.vercel.app/premium` affiche la nouvelle version, puis tester les pages et API publiques. Les parties connectées ne peuvent être testées que par le propriétaire.

Les réponses réelles d'osu! peuvent différer des faux : tout code qui lit l'API osu! doit être défensif (champs optionnels, `numOrNull`, try/catch qui dégrade sans casser la page).

## Versionner (à chaque modification du site)

- `app/lib/config.ts` : `APP_VERSION = "bêta X.Y"` (affiché dans le pied de page — ne jamais l'écrire en dur ailleurs).
- `package.json` et `package-lock.json` (deux occurrences) : `"version": "X.Y.0"`.
- `README.md` : « (bêta X.Y) » en tête et « bêta X.Y ↔ X.Y.0 » dans *Versions*.
- Incrémenter la partie Y (2.4 → 2.5 …) pour une série de changements ; la partie X pour un changement majeur.

## Documenter (à chaque modification, dans le même commit)

Pour **chaque** fonctionnalité ajoutée ou modifiée, mettre à jour [`FEATURES.md`](FEATURES.md) avec la fiche suivante (copier le modèle en tête de ce fichier) :
*but*, *comment ça marche* (flux), *comment ça doit fonctionner* (invariants à ne pas casser), *fichiers*, *données/stockage*, *limites*, *sécurité*, *tests*.
Si une clé Redis, une route, une variable d'environnement ou un module nouveau apparaît : l'ajouter aussi à `ARCHITECTURE.md` / au tableau du `README.md`.
Si une demande recoupe quelque chose d'existant : ne pas le refaire, le signaler dans la fiche (« existe déjà : … »).

## Publier

1. Vérifier types + build (ci-dessus), incrémenter la version, mettre la doc à jour.
2. `git add react && git commit` (message en anglais, impératif ; terminer par la ligne `Co-Authored-By` de l'outil utilisé). Ne jamais ajouter `Nyra.jpeg` ni les fichiers racine du propriétaire (`shosu.png` à la racine, etc.), ni `.env*`.
3. `git push origin main` → Vercel déploie en production (≈ 1 min). Vérifier https://shosure.vercel.app/premium (version affichée) puis les pages concernées.
4. CLI Vercel : `npx vercel@latest …` (la machine du propriétaire est connectée). Variables d'environnement : `npx vercel@latest env ls`. Les installations Marketplace demandent d'accepter des conditions : c'est au propriétaire de le faire.

## Diagnostiquer la production

- Les échecs de l'API osu! (hors 404) sont journalisés par `osu.server.ts#logOsuFailure` : méthode, chemin **sans identifiants** et code HTTP (« osu! API failure: GET /users/:n/scores/recent 4xx »). Lire les journaux : `npx vercel@latest logs https://shosure.vercel.app` (ou le tableau de bord Vercel > Logs).
- Une fonctionnalité qui « marche mais renvoie vide » en production vient souvent d'un point d'accès osu! qui répond autrement qu'en local (le faux osu! de `dev/` est généreux) : chercher d'abord ce journal.

## Pièges connus

- Un module `*.server.ts` importé côté navigateur casse le build : déplacer les types partagés dans un module neutre.
- `legacy.css` définit des styles globaux sur `button` (42×42 px) : les boutons personnalisés doivent surcharger `width/height` (voir `button.icon-btn`, `button.assistant-play`…).
- HeroUI `Button` n'accepte pas `role` ni `title` ; utiliser `aria-label`.
- Les cartes (`.beatmap-card`) ont `overflow: hidden` : les menus flottants doivent être rendus dans `document.body` via `createPortal` (voir `collection-menu.tsx`).
- `main` est remonté à chaque changement de chemin (`key={pathname}` dans `layout.tsx`) pour rejouer l'animation d'entrée ; l'état local des pages est donc réinitialisé quand le chemin change (pas quand seul `?query` change).
- osu! renvoie `mods` sous forme de chaînes ou d'objets `{acronym}` selon les endpoints : toujours normaliser.
- Les captures d'écran prises pendant une animation d'entrée paraissent vides : attendre ~1,5 s.
