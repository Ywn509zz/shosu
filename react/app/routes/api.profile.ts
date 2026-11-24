import { data } from "react-router";

import { saveProfileCustom } from "~/lib/profile-custom.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/api.profile";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 1_500;

/** POST /api/profile { bio, accent, banner, featured[] } — personnalise le profil shOsu! du joueur CONNECTÉ (jamais d'un autre). */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return data({ error: "forbidden" }, { status: 403, headers });

  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers });
  if (!isPersistent()) return data({ error: "storage_not_persistent" }, { status: 503, headers });

  const hit = await rateLimit(`profile:${user.id}`, 30, 10 * 60_000);
  if (!hit.ok) return data({ error: "rate_limited" }, { status: 429, headers });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return data({ error: "invalid_request" }, { status: 413, headers });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return data({ error: "invalid_request" }, { status: 400, headers });
  }

  try {
    return data({ ok: true, custom: await saveProfileCustom(user.osuId, body) }, { headers });
  } catch {
    return data({ error: "storage_unavailable" }, { status: 503, headers });
  }
}
