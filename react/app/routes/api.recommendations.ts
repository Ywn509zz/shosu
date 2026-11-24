import { data } from "react-router";

import { getRecommendations } from "~/lib/recommend.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.recommendations";

/** Réponse propre au joueur connecté : jamais mise en cache partagée. */
const headers = { "Cache-Control": "private, no-store" };
const MODES = ["osu", "taiko", "fruits", "mania"];
/** Chaque calcul interroge osu! plusieurs fois : 12 par 10 min et par joueur (compteur par instance, sans Redis). */
const LIMIT = { limit: 12, windowMs: 10 * 60_000 };

/** GET /api/recommendations[?mode=osu] — beatmaps recommandées d'après les habitudes de jeu du joueur connecté. */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers });

  const hit = await rateLimit(`reco:${user.id}`, LIMIT.limit, LIMIT.windowMs, false);
  if (!hit.ok) return data({ error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": String(hit.retryAfterSeconds) } });

  const mode = new URL(request.url).searchParams.get("mode") ?? undefined;
  try {
    return data(await getRecommendations(user.osuId, mode && MODES.includes(mode) ? mode : undefined), { headers });
  } catch (error) {
    console.error("Recommendations error:", error instanceof Error ? error.name : "Error");
    return data({ error: "temporarily unavailable" }, { status: 502, headers });
  }
}
