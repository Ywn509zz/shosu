import { data } from "react-router";

import { analyzeDifficulty } from "~/lib/analysis.server";
import { OsuError } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";

import type { Route } from "./+types/api.analysis";

const headers = { "Cache-Control": "no-store", Allow: "GET" };
const cacheableHeaders = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600", Allow: "GET" };

/** Chaque analyse demande une dizaine d'appels à osu! : 20 par minute et par IP (compteur par instance). */
const IP_LIMIT = { limit: 20, windowMs: 60_000 };

/** GET /api/analysis?id=<difficulté> — difficulté de cette beatmap avec chaque mod. */
export async function loader({ request }: Route.LoaderArgs) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d{1,10}$/.test(id)) return data({ error: "Invalid id" }, { status: 400, headers });

  const hit = await rateLimit(`analysis:${clientIp(request)}`, IP_LIMIT.limit, IP_LIMIT.windowMs, false);
  if (!hit.ok) {
    return data({ error: "Too many requests" }, { status: 429, headers: { ...headers, "Retry-After": String(hit.retryAfterSeconds) } });
  }

  try {
    return data({ analysis: await analyzeDifficulty(Number(id)) }, { headers: cacheableHeaders });
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) return data({ error: "Not found" }, { status: 404, headers });
    console.error("Difficulty analysis error:", error instanceof Error ? error.name : "Error");
    return data({ error: "temporarily unavailable" }, { status: 502, headers });
  }
}
