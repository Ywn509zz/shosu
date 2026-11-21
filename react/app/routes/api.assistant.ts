import { data } from "react-router";

import { MAX_MESSAGE_LENGTH, type ChatTurn } from "~/lib/assistant";
import { runAssistant } from "~/lib/assistant.server";
import { GeminiError, isGeminiConfigured } from "~/lib/gemini.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.assistant";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 16_000;
const MAX_HISTORY = 12;

/** Par utilisateur : 20 messages / 10 min. Global (par instance) : 200 / heure. */
const USER_LIMIT = { limit: 20, windowMs: 10 * 60_000 };
const GLOBAL_LIMIT = { limit: 200, windowMs: 60 * 60_000 };

const fail = (code: string, status: number, extra: HeadersInit = {}) =>
  data({ error: code }, { status, headers: { ...headers, ...extra } });

/**
 * L'historique vient du navigateur : on ne lui fait pas confiance. Seuls des
 * textes « user » / « assistant » bornés sont acceptés (aucun appel d'outil
 * ni message système forgé), et le dernier message doit être celui de l'utilisateur.
 */
function normalizeHistory(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;

  const turns: ChatTurn[] = [];
  for (const item of raw.slice(-2 * MAX_HISTORY)) {
    if (!item || typeof item !== "object") return null;
    const { role, text } = item as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;

    const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) continue;

    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text = `${last.text}\n${clean}`.slice(0, 2 * MAX_MESSAGE_LENGTH);
    else turns.push({ role, text: clean });
  }

  const recent = turns.slice(-MAX_HISTORY);
  while (recent[0]?.role === "assistant") recent.shift();
  if (recent.length === 0 || recent[recent.length - 1].role !== "user") return null;
  return recent;
}

/**
 * POST /api/assistant — assistant IA (Gemini avec outils de recherche).
 * Réservé aux utilisateurs connectés : la clé Gemini est un budget partagé.
 */
export async function action({ request }: Route.ActionArgs) {
  // Anti-CSRF en plus du cookie SameSite=Lax : la requête doit venir de notre origine.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user || !user.osuId) return fail("unauthenticated", 401);

  if (!isGeminiConfigured()) return fail("assistant_unavailable", 503);

  const userHit = rateLimit(`assistant:user:${user.id}`, USER_LIMIT.limit, USER_LIMIT.windowMs);
  const globalHit = rateLimit("assistant:global", GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowMs);
  if (!userHit.ok || !globalHit.ok) {
    const retry = Math.max(userHit.retryAfterSeconds, globalHit.retryAfterSeconds);
    return fail("rate_limited", 429, { "Retry-After": String(retry) });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 413);
  let body: { messages?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid_request", 400);
  }

  const history = normalizeHistory(body.messages);
  if (!history) return fail("invalid_request", 400);

  try {
    return data(await runAssistant({ history, osuId: user.osuId }), { headers });
  } catch (error) {
    if (error instanceof GeminiError) {
      // Un code seulement : ni clé, ni prompt, ni réponse du modèle dans les journaux.
      console.error("Gemini assistant error:", error.kind);
      return fail(error.kind === "bad_response" ? "ai_bad_response" : "ai_unavailable", 503);
    }
    console.error("Assistant error:", error instanceof Error ? error.name : "Error");
    return fail("assistant_failed", 502);
  }
}
