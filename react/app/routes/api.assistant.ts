import { data } from "react-router";

import { MAX_MESSAGE_LENGTH, type ChatTurn } from "~/lib/assistant";
import { runAssistant } from "~/lib/assistant.server";
import { isGeminiConfigured } from "~/lib/gemini.server";
import { PLANS } from "~/lib/plans";
import { streamEvents } from "~/lib/ndjson.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.assistant";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 24_000;
const MAX_HISTORY = 12;
const MAX_KNOWN_IDS = 120;

/** Par utilisateur : selon son plan (voir plans.ts) par 10 min. Global : 200 / heure. Partagés entre instances si Upstash est configuré. */
const USER_WINDOW_MS = 10 * 60_000;
const GLOBAL_LIMIT = { limit: 200, windowMs: 60 * 60_000 };

const fail = (code: string, status: number, extra: HeadersInit = {}) =>
  data({ error: code }, { status, headers: { ...headers, ...extra } });

const isId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000_000;

/**
 * L'historique vient du navigateur : on ne lui fait pas confiance. Seuls des textes « user » /
 * « assistant » bornés sont acceptés (aucun appel d'outil ni message système forgé), et le dernier
 * message doit être celui de l'utilisateur. Les `cardIds` ne servent qu'à désigner des beatmaps
 * déjà affichées à l'utilisateur (liste blanche des modifications de listes).
 */
function normalizeHistory(raw: unknown): { turns: ChatTurn[]; knownIds: Set<number> } | null {
  if (!Array.isArray(raw)) return null;

  const turns: ChatTurn[] = [];
  const knownIds = new Set<number>();

  for (const item of raw.slice(-2 * MAX_HISTORY)) {
    if (!item || typeof item !== "object") return null;
    const { role, text, cardIds } = item as { role?: unknown; text?: unknown; cardIds?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;

    if (role === "assistant" && Array.isArray(cardIds)) {
      for (const id of cardIds) if (isId(id) && knownIds.size < MAX_KNOWN_IDS) knownIds.add(id);
    }

    const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean) continue;

    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text = `${last.text}\n${clean}`.slice(0, 2 * MAX_MESSAGE_LENGTH);
    else turns.push({ role, text: clean });
  }

  const recent = turns.slice(-MAX_HISTORY);
  while (recent[0]?.role === "assistant") recent.shift();
  if (recent.length === 0 || recent[recent.length - 1].role !== "user") return null;
  return { turns: recent, knownIds };
}

/**
 * POST /api/assistant — assistant IA (Gemini avec outils), réponse en flux : un objet JSON par ligne
 * (texte au fil de l'eau, cartes, actions…). Réservé aux utilisateurs connectés : la clé Gemini est
 * un budget partagé.
 */
export async function action({ request }: Route.ActionArgs) {
  // Anti-CSRF en plus du cookie SameSite=Lax : la requête doit venir de notre origine.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user || !user.osuId) return fail("unauthenticated", 401);

  if (!isGeminiConfigured()) return fail("assistant_unavailable", 503);

  const userHit = await rateLimit(`assistant:user:${user.id}`, PLANS[user.plan].stackMessagesPer10Min, USER_WINDOW_MS);
  const globalHit = await rateLimit("assistant:global", GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowMs);
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

  return streamEvents((emit) =>
    runAssistant({ history: history.turns, knownIds: history.knownIds, osuId: user.osuId!, userName: user.name, plan: user.plan, emit }),
  );
}
