import { data } from "react-router";

import { findSimilar } from "~/lib/similar.server";
import { OsuError } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";

import type { Route } from "./+types/api.similar";

const headers = { "Cache-Control": "no-store", Allow: "GET" };
/** Donnée publique : le CDN la garde 5 min (les requêtes servies par le CDN ne comptent pas dans la limite). */
const cacheableHeaders = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900", Allow: "GET" };

/** 40 demandes par minute et par IP, compteur par instance (aucune commande Redis consommée). */
const IP_LIMIT = { limit: 40, windowMs: 60_000 };

/** GET /api/similar?id=<set> — beatmaps qui ressemblent à celle-ci. */
export async function loader({ request }: Route.LoaderArgs) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d{1,10}$/.test(id)) return data({ error: "Invalid id" }, { status: 400, headers });

  const hit = await rateLimit(`similar:${clientIp(request)}`, IP_LIMIT.limit, IP_LIMIT.windowMs, false);
  if (!hit.ok) {
    return data({ error: "Too many requests" }, { status: 429, headers: { ...headers, "Retry-After": String(hit.retryAfterSeconds) } });
  }

  try {
    return data({ items: await findSimilar(Number(id)) }, { headers: cacheableHeaders });
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) return data({ error: "Not found" }, { status: 404, headers });
    console.error("Similar maps error:", error instanceof Error ? error.name : "Error");
    return data({ error: "temporarily unavailable" }, { status: 502, headers });
  }
}
