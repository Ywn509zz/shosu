import { data } from "react-router";

import { MAX_AUDIO_BYTES, runListen, wavSeconds } from "~/lib/listen.server";
import { isGeminiConfigured } from "~/lib/gemini.server";
import { streamEvents } from "~/lib/ndjson.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { bump } from "~/lib/usage-buffer";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.listen";

const headers = { "Cache-Control": "no-store" };

/** Écouter coûte plus cher qu'un message : 6 extraits / 10 min par joueur, 60 / heure au total. */
const USER_LIMIT = { limit: 6, windowMs: 10 * 60_000 };
const GLOBAL_LIMIT = { limit: 60, windowMs: 60 * 60_000 };

const fail = (code: string, status: number, extra: HeadersInit = {}) =>
  data({ error: code }, { status, headers: { ...headers, ...extra } });

/**
 * POST /api/listen — « Shazam pour osu! ». Le corps est un WAV PCM 16 bits mono 16 kHz (30 s max),
 * produit par le navigateur. Réservé aux utilisateurs connectés (la clé Gemini est un budget partagé).
 * La réponse est un flux d'événements, comme pour Stack.
 */
export async function action({ request }: Route.ActionArgs) {
  // Anti-CSRF en plus du cookie SameSite=Lax : la requête doit venir de notre origine.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user || !user.osuId) return fail("unauthenticated", 401);

  if (!isGeminiConfigured()) return fail("assistant_unavailable", 503);

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/wav")) {
    return fail("audio_invalid", 415);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_AUDIO_BYTES) return fail("audio_too_large", 413);

  const userHit = await rateLimit(`listen:user:${user.id}`, USER_LIMIT.limit, USER_LIMIT.windowMs);
  const globalHit = await rateLimit("listen:global", GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowMs);
  if (!userHit.ok || !globalHit.ok) {
    const retry = Math.max(userHit.retryAfterSeconds, globalHit.retryAfterSeconds);
    return fail("rate_limited", 429, { "Retry-After": String(retry) });
  }

  const wav = new Uint8Array(await request.arrayBuffer());
  if (wav.length > MAX_AUDIO_BYTES) return fail("audio_too_large", 413);
  const seconds = wavSeconds(wav);
  if (seconds === null) return fail("audio_invalid", 400);

  bump("listen");
  return streamEvents((emit) => runListen({ wav, seconds, emit }));
}
