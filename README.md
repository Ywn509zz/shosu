# Migration ShOsu! Render vers Vercel Preview

Cette branche ajoute les fonctions serverless Vercel à la racine du frontend.

## Variables d'environnement

Dans les réglages du projet Vercel, ajouter `CLIENT_ID` et `CLIENT_SECRET`
pour l'environnement **Preview** uniquement. Ne jamais les placer dans
`script.js`, dans le dépôt ou dans une URL.

Les fonctions `api/search.js` et `api/preview.js` utilisent les variables
uniquement côté serveur. Le token OAuth est conservé en mémoire par instance
Vercel pendant sa durée de validité.

## Vérification sur Preview

1. Pousser la branche `migration-vercel` vers le dépôt distant et ouvrir une
   pull request afin que Vercel crée un déploiement Preview.
2. Après le déploiement, ouvrir `https://<preview-url>/api/search?q=Camellia`.
   La réponse attendue est un JSON contenant `beatmapsets`; une erreur 500/502
   indique généralement une variable d'environnement Preview absente ou
   incorrecte.
3. Tester la recherche depuis l'interface et vérifier les filtres, la
   pagination et la lecture des aperçus audio.
4. Garder Render actif pendant ces vérifications. Après validation complète de
   Preview, configurer les mêmes variables pour Production et effectuer un
   nouveau déploiement avant de désactiver Render.

`/api/preview` est conservée pour compatibilité. L'interface utilise
actuellement directement l'URL audio osu!, donc cette route n'est pas appelée
par la recherche actuelle.
