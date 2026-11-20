import { data } from "react-router";

import { ADVISOR_MODES, MAX_PREFERENCES_LENGTH, type AdvisorMode } from "~/lib/advisor";
import { runAdvisor } from "~/lib/advisor.server";
import { GeminiError, isGeminiConfigured } from "~/lib/gemini.server";
import { OsuError } from "~/lib/osu.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.advisor";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 2_000;

/** Par utilisateur : 5 demandes / 10 min. Global (par instance) : 60 / heure. */
const USER_LIMIT = { limit: 5, windowMs: 10 * 60_000 };
const GLOBAL_LIMIT = { limit: 60, windowMs: 60 * 60_000 };

const fail = (code: string, status: number, extra: HeadersInit = {}) =>
  data({ error: code }, { status, headers: { ...headers, ...extra } });

/**
 * POST /api/advisor — conseiller de beatmaps (Gemini).
 * Réservé aux utilisateurs connectés : la clé Gemini est un budget partagé.
 */
export async function action({ request }: Route.ActionArgs) {
  // Anti-CSRF en plus du cookie SameSite=Lax : la requête doit venir de notre origine.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user || !user.osuId) return fail("unauthenticated", 401);

  if (!isGeminiConfigured()) return fail("advisor_unavailable", 503);

  const userHit = rateLimit(`advisor:user:${user.id}`, USER_LIMIT.limit, USER_LIMIT.windowMs);
  const globalHit = rateLimit("advisor:global", GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowMs);
  if (!userHit.ok || !globalHit.ok) {
    const retry = Math.max(userHit.retryAfterSeconds, globalHit.retryAfterSeconds);
    return fail("rate_limited", 429, { "Retry-After": String(retry) });
  }

  // Entrée : JSON borné, champs validés un à un.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 413);
  let body: { mode?: unknown; preferences?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid_request", 400);
  }

  const mode = ADVISOR_MODES.find((m) => m === body.mode) as AdvisorMode | undefined;
  const preferences =
    typeof body.preferences === "string"
      ? body.preferences.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
      : "";
  if (!mode || preferences.length > MAX_PREFERENCES_LENGTH) return fail("invalid_request", 400);

  try {
    const result = await runAdvisor({ osuId: user.osuId, mode, preferences });
    return data(result, { headers });
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) return fail("profile_not_found", 404);
    if (error instanceof GeminiError) {
      // Un code seulement : ni clé, ni prompt, ni réponse du modèle dans les journaux.
      console.error("Gemini advisor error:", error.kind);
      return fail(error.kind === "bad_response" ? "ai_bad_response" : "ai_unavailable", 503);
    }
    console.error("Advisor error:", error instanceof Error ? error.name : "Error");
    return fail("advisor_failed", 502);
  }
}
