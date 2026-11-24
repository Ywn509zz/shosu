# dev/ — faux services pour tester en local

Lancés par `./dev/dev.sh` (arrêt : `./dev/stop.sh`). Aucun secret, aucun compte, aucun appel réseau externe.

| Fichier | Port | Simule | Particularités |
| --- | --- | --- | --- |
| `mock-osu.mjs` | 4010 | osu! : OAuth complet + API v2 | 48 beatmapsets générés (ids réels 41823 + 211·n, donc covers/aperçus existent souvent), joueurs `38656812` « Vinncent » (stats en standard et mania) et `37954459` « maybe_unknow » (aucune stat), scores, beatmapsets du joueur, activité, classements, `POST /beatmaps/:id/attributes` (étoiles variant avec les mods) |
| `mock-gemini.mjs` | 4020 | Gemini `streamGenerateContent` (SSE) | répond mot à mot ; déclenche un appel d'outil si le message contient `[tool:nom {json}]` ; écrit les réponses d'outils dans `dev/tool-responses.log` |
| `mock-redis.mjs` | 4030 | API REST d'Upstash `/pipeline` | commandes INCR/TTL/EXPIRE/HSET/HGET/HDEL/HEXISTS/HLEN/HGETALL/DEL ; `GET /stats` donne le nombre de commandes et les clés |

Variables posées par `dev.sh` : `OSU_BASE_URL`, `GEMINI_BASE_URL`, `GEMINI_API_KEY=fake`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `CLIENT_ID/SECRET`, `SESSION_SECRET`, `OSU_REDIRECT_URI`, `BETTER_AUTH_URL`.

Limites : les données sont fictives (les réponses réelles d'osu! peuvent avoir d'autres champs) ; quand on ajoute un endpoint osu! à l'application, **ajouter son faux ici** (même forme de réponse
que la doc osu! API v2) et le noter dans ce tableau. Le faux Gemini ne comprend pas le français : il sert à tester le câblage (outils, flux, cartes), pas la qualité des réponses.
