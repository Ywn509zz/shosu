import { data } from "react-router";

import { OsuError } from "~/lib/osu.server";
import { analyzePerformance } from "~/lib/performance.server";
import { MODES } from "~/lib/progress.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";

import type { Route } from "./+types/api.performance";

const noStore = { "Cache-Control": "no-store" };
const cacheable = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800", Allow: "GET" };

/** GET /api/performance?player=<id osu!>&mode=osu — forces et points faibles d'un joueur, d'après ses scores publics. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const player = url.searchParams.get("player") ?? "";
  const mode = url.searchParams.get("mode") ?? "osu";
  if (!/^\d{1,10}$/.test(player) || !(MODES as readonly string[]).includes(mode)) {
    return data({ error: "invalid_request" }, { status: 400, headers: noStore });
  }

  // Chaque analyse lit 200 scores chez osu! : 20 par minute et par IP, compteur par instance.
  const hit = await rateLimit(`performance:${clientIp(request)}`, 20, 60_000, false);
  if (!hit.ok)
    return data(
      { error: "rate_limited" },
      { status: 429, headers: { ...noStore, "Retry-After": String(hit.retryAfterSeconds) } },
    );

  try {
    return data({ analysis: await analyzePerformance(Number(player), mode) }, { headers: cacheable });
  } catch (error) {
    if (error instanceof OsuError && error.status === 404)
      return data({ error: "not_found" }, { status: 404, headers: noStore });
    console.error("Performance error:", error instanceof Error ? error.name : "Error");
    return data({ error: "unavailable" }, { status: 502, headers: noStore });
  }
}
