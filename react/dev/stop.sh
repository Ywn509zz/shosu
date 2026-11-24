#!/bin/sh
# Arrête les faux services et le serveur de dev lancés par dev.sh.
pkill -f "dev/mock-osu.mjs"; pkill -f "dev/mock-gemini.mjs"; pkill -f "dev/mock-redis.mjs"; pkill -f "react-router dev"
echo "arrêté"
