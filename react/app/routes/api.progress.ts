import { data } from "react-router";

import { MODES, getProgress, recordSnapshot } from "~/lib/progress.server";
import { OsuError } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.progress";

const noStore = { "Cache-Control": "no-store" };
/** Données publiques (osu! + relevés d'un joueur connecté) : le CDN les garde 5 min. */
const cacheable = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900", Allow: "GET, POST" };

/** GET /api/progress?player=<id osu!>&mode=osu — suivi de progression d'un joueur (rang 90 j, parties, relevés shOsu!, modes). */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const player = url.searchParams.get("player") ?? "";
  const mode = url.searchParams.get("mode") ?? "osu";
  if (!/^\d{1,10}$/.test(player) || !(MODES as readonly string[]).includes(mode)) {
    return data({ error: "invalid_request" }, { status: 400, headers: noStore });
  }

  // Compteur par instance : 0 commande Redis pour la limite (la lecture des relevés en coûte une, mise en cache par le CDN).
  const hit = await rateLimit(`progress:${clientIp(request)}`, 40, 60_000, false);
  if (!hit.ok)
    return data(
      { error: "rate_limited" },
      { status: 429, headers: { ...noStore, "Retry-After": String(hit.retryAfterSeconds) } },
    );

  try {
    return data(await getProgress(Number(player), mode), { headers: cacheable });
  } catch (error) {
    if (error instanceof OsuError && error.status === 404)
      return data({ error: "not_found" }, { status: 404, headers: noStore });
    console.error("Progress error:", error instanceof Error ? error.name : "Error");
    return data({ error: "unavailable" }, { status: 502, headers: noStore });
  }
}

/**
 * POST /api/progress — enregistre le relevé du jour du joueur CONNECTÉ (jamais d'un autre). Appelé au plus une fois par jour
 * par le navigateur (voir layout.tsx), pour que l'historique des pp et de la précision se construise même sans ouvrir son profil.
 */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return data({ error: "forbidden" }, { status: 403, headers: noStore });

  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers: noStore });

  const hit = await rateLimit(`snapshot:${user.id}`, 6, 60 * 60_000, false);
  if (!hit.ok) return data({ error: "rate_limited" }, { status: 429, headers: noStore });

  try {
    return data({ ok: true, recorded: await recordSnapshot(user.osuId) }, { headers: noStore });
  } catch {
    return data({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}
