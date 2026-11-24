# AGENTS.md — lire en premier (pour toute IA ou tout développeur qui reprend shOsu!)

shOsu! est un site de recherche de beatmaps osu! (React Router 8 + HeroUI v3 + Better Auth, hébergé sur Vercel, base Redis Upstash).
Le dossier `react/` est **le site en production**. Les fichiers HTML/CSS/JS à la racine du dépôt sont l'ancienne version : ne pas y toucher.

## Où trouver quoi

| Besoin | Fichier |
| --- | --- |
| Vue d'ensemble, stack, arborescence, flux de données, sécurité | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **Comment chaque fonctionnalité marche et doit marcher** (fichiers, données, limites, invariants, tests) | [`docs/FEATURES.md`](docs/FEATURES.md) |
| Workflow : lancer en local, tester, versionner, publier, règles de documentation | [`docs/DEV-GUIDE.md`](docs/DEV-GUIDE.md) |
| Faux services locaux (osu!, Gemini, Redis) | [`dev/README.md`](dev/README.md) |
| README public (installation, variables d'environnement, plans) | [`README.md`](README.md) |

## Règles non négociables (demandées par le propriétaire du site)

1. **Documenter chaque modification** dans [`docs/FEATURES.md`](docs/FEATURES.md) (et `docs/ARCHITECTURE.md` si la structure change), **dans le même commit** :
   ce que fait la fonctionnalité, comment elle marche, comment elle *doit* fonctionner (invariants), fichiers, clés de stockage, limites, comment la tester.
   Une autre IA doit pouvoir reprendre le travail sans relire tout le code. Ne pas toucher à ce qui existe déjà quand une demande le recouvre : le dire et passer.
2. **Changer la version à chaque modification du site** : « bêta X.Y » dans `app/lib/config.ts` (`APP_VERSION`, affichée en pied de page) **et** `version` (`X.Y.0`) dans
   `package.json` + `package-lock.json`, plus la mention dans `README.md`. Détails dans le guide.
3. **Le site reste entièrement gratuit** : aucun paiement ni Stripe. Le plan Premium est attribué à la main (voir `docs/FEATURES.md` § Plans).
4. **Identité visuelle** : structure inspirée de https://iptron.one **mais couleurs (violet `#9c7cff`) et police (système, titres gras) d'origine de shOsu!**, voulues par le propriétaire (2026-11-24). Tout est centralisé dans `app/theme.css` (voir `docs/FEATURES.md` § Thème visuel) : changer couleurs/polices **là**, jamais en dur ailleurs ; pas de police web ni de palette bleue sans demande. Les fichiers HTML/CSS/JS de la racine du dépôt restent intacts.
5. **Stack est masculin** (« il »), l'assistant s'appelle Stack, son logo est `public/stack.jpeg`.
6. **Sécurité d'abord** : aucun secret côté client, entrées validées, origines vérifiées sur les POST, données privées jamais mises en cache partagé (voir ARCHITECTURE § Sécurité).
7. **Économiser le quota Redis gratuit** (500 000 commandes/mois chez Upstash) : pas de commande Redis sur les routes très fréquentes (voir ARCHITECTURE § Redis).
8. Publier = pousser sur `main` (déploiement automatique en production sur Vercel). Le propriétaire a autorisé de pousser directement ; ne jamais commiter de secret ni `.env*`.

## Ce qui reste hors de portée / à ne pas promettre

- Les secrets osu! (`CLIENT_ID`/`CLIENT_SECRET`) sont « sensibles » sur Vercel : illisibles hors production. En local on utilise les faux services de `dev/`.
- La connexion osu! ne demande que `identify` : pas d'amis, de messages ni d'e-mail. Stack ne lit que des données publiques.
- Aucune beatmap n'est hébergée ni relayée par shOsu! (les exports pointent vers des miroirs communautaires).
