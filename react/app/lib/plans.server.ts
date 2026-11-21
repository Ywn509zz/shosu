import { cached, forget } from "./cache.server";
import { isPlanId, type PlanId } from "./plans";
import { hash, isPersistent } from "./store.server";

/**
 * Attribution des plans.
 *
 * Un joueur est Premium si l'une de ces sources le dit :
 *   1. la variable PREMIUM_USER_IDS (identifiants osu! séparés par des virgules) — permanent, sans base ;
 *   2. une entrée dans la base (`shosu:plans`), écrite par l'endpoint d'administration ou, plus tard,
 *      par le webhook Stripe : { plan, until } où `until` (ms, ou null) est la date d'expiration.
 * En cas de doute ou de panne de la base, on retombe sur « free » : on ne donne jamais un avantage par erreur.
 */
const PLANS_KEY = "shosu:plans";

function envPremiumIds(): Set<number> {
  return new Set(
    (process.env.PREMIUM_USER_IDS ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
  );
}

async function readPlan(osuId: number): Promise<PlanId> {
  if (envPremiumIds().has(osuId)) return "premium";
  try {
    const raw = await hash.get(PLANS_KEY, String(osuId));
    if (!raw) return "free";
    const entry = JSON.parse(raw) as { plan?: unknown; until?: unknown };
    if (!isPlanId(entry.plan)) return "free";
    if (typeof entry.until === "number" && entry.until <= Date.now()) return "free";
    return entry.plan;
  } catch {
    return "free";
  }
}

/** Plan d'un joueur (gardé 60 s en mémoire : la page n'interroge pas la base à chaque affichage). */
export function getPlan(osuId: number): Promise<PlanId> {
  return cached(`plan:${osuId}`, 60_000, () => readPlan(osuId));
}

/** Attribue un plan ; `days` : durée en jours (absent = sans limite). Exige une base persistante. */
export async function setPlan(osuId: number, plan: PlanId, days?: number): Promise<{ until: number | null }> {
  if (!isPersistent()) throw new Error("storage_not_persistent");
  const until = days ? Date.now() + days * 86_400_000 : null;
  await hash.set(PLANS_KEY, String(osuId), JSON.stringify({ plan, until }));
  forget(`plan:${osuId}`);
  return { until };
}
