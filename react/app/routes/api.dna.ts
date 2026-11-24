import { data } from "react-router";

import { getMusicDna } from "~/lib/dna.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.dna";

/** Réponse propre au joueur connecté : jamais mise en cache partagée. */
const headers = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 600;
/** Chaque calcul lit jusqu'à 40 beatmaps chez osu! : 8 par 10 min et par joueur (compteur par instance, sans Redis). */
const LIMIT = { limit: 8, windowMs: 10 * 60_000 };

/**
 * POST /api/dna  { viewed?: number[] } — empreinte musicale (Music DNA) du joueur connecté.
 * `viewed` : jusqu'à 20 identifiants de beatmaps consultées récemment (l'historique est local au navigateur, donc envoyé ici).
 * C'est un POST parce qu'il porte ce corps ; il ne modifie rien.
 */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return data({ error: "forbidden" }, { status: 403, headers });

  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers });

  const hit = await rateLimit(`dna:${user.id}`, LIMIT.limit, LIMIT.windowMs, false);
  if (!hit.ok)
    return data(
      { error: "rate_limited" },
      { status: 429, headers: { ...headers, "Retry-After": String(hit.retryAfterSeconds) } },
    );

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return data({ error: "invalid_request" }, { status: 413, headers });
  let viewed: number[] = [];
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (Array.isArray(body.viewed)) {
      viewed = body.viewed
        .filter(
          (id: unknown): id is number =>
            typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 1_000_000_000,
        )
        .slice(0, 20);
    }
  } catch {
    return data({ error: "invalid_request" }, { status: 400, headers });
  }

  try {
    return data({ dna: await getMusicDna(user.osuId, viewed) }, { headers });
  } catch (error) {
    console.error("Music DNA error:", error instanceof Error ? error.name : "Error");
    return data({ error: "unavailable" }, { status: 502, headers });
  }
}
