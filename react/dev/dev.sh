#!/bin/sh
# Lance le site en local avec de faux services (osu!, Gemini, Redis) : aucun secret ni compte réel nécessaire.
#   ./dev/dev.sh        démarre les 3 faux services puis le serveur de dev (http://localhost:5173)
#   ./dev/stop.sh       arrête tout
# Connexion : ouvrir http://localhost:5173/api/auth/login → connecté en « Vinncent » (id 38656812) par le faux osu!.
cd "$(dirname "$0")/.." || exit 1
LOG=dev/.logs; mkdir -p "$LOG"

node dev/mock-osu.mjs    > "$LOG/osu.log"    2>&1 &
node dev/mock-gemini.mjs > "$LOG/gemini.log" 2>&1 &
node dev/mock-redis.mjs  > "$LOG/redis.log"  2>&1 &

export OSU_BASE_URL=http://localhost:4010
export GEMINI_BASE_URL=http://localhost:4020 GEMINI_API_KEY=fake
export KV_REST_API_URL=http://localhost:4030 KV_REST_API_TOKEN=t
export CLIENT_ID=x CLIENT_SECRET=y
export SESSION_SECRET=localtestsecretlocaltestsecret123456
export OSU_REDIRECT_URI=http://localhost:5173/api/auth/callback BETTER_AUTH_URL=http://localhost:5173
# Pour tester Premium : export PREMIUM_USER_IDS=38656812
exec npm run dev
