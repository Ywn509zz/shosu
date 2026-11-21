import { timingSafeEqual } from "node:crypto";

import { data } from "react-router";

import { isPlanId } from "~/lib/plans";
import { getPlan, setPlan } from "~/lib/plans.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/api.admin.plan";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 300;

/** Le jeton d'administration doit être long (24 caractères minimum) : sinon l'endpoint n'existe pas. */
function isAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 24) return false;

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const hidden = () => data(null, { status: 404, headers });

/**
 * Administration des plans (attribution manuelle du Premium).
 *   GET  /api/admin/plan?osuId=727
 *   POST /api/admin/plan  { "osuId": 727, "plan": "premium", "days": 30 }   (days facultatif)
 * Réservé au détenteur d'ADMIN_TOKEN (`Authorization: Bearer …`). Sans jeton valide : 404, comme si la
 * route n'existait pas. Le webhook Stripe écrira plus tard au même endroit (plans.server.ts : setPlan).
 */
export async function loader({ request }: Route.LoaderArgs) {
  // Limite par adresse IP *avant* de vérifier le jeton : décourage les essais répétés.
  const hit = await rateLimit(`admin:${clientIp(request)}`, 30, 60_000);
  if (!hit.ok || !isAuthorized(request)) return hidden();

  const osuId = Number(new URL(request.url).searchParams.get("osuId"));
  if (!Number.isInteger(osuId) || osuId < 1) return data({ error: "invalid_request" }, { status: 400, headers });
  return data({ osuId, plan: await getPlan(osuId), persistent: isPersistent() }, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const hit = await rateLimit(`admin:${clientIp(request)}`, 30, 60_000);
  if (!hit.ok || !isAuthorized(request)) return hidden();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return data({ error: "invalid_request" }, { status: 413, headers });
  let body: { osuId?: unknown; plan?: unknown; days?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return data({ error: "invalid_request" }, { status: 400, headers });
  }

  const { osuId, plan, days } = body;
  if (
    typeof osuId !== "number" || !Number.isInteger(osuId) || osuId < 1 || osuId > 1_000_000_000 ||
    !isPlanId(plan) ||
    (days !== undefined && (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 3650))
  ) {
    return data({ error: "invalid_request" }, { status: 400, headers });
  }

  try {
    const { until } = await setPlan(osuId, plan, days);
    return data({ ok: true, osuId, plan, until }, { headers });
  } catch (error) {
    // Sans base persistante, une attribution serait perdue au prochain redéploiement : on refuse plutôt que de mentir.
    const code = error instanceof Error && error.message === "storage_not_persistent" ? "storage_not_persistent" : "storage_unavailable";
    return data({ error: code }, { status: 503, headers });
  }
}
