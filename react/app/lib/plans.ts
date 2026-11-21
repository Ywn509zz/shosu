/**
 * Formules de shOsu! : définitions partagées entre serveur et navigateur.
 *
 * Modifier ici les limites de chaque plan. Les prix ne sont volontairement pas définis : les
 * abonnements (Stripe) se brancheront sur `setPlan` (voir plans.server.ts) une fois les tarifs choisis.
 */
export const PLAN_IDS = ["free", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanDefinition = {
  label: string;
  /** Messages envoyés à Stack par fenêtre de 10 minutes. */
  stackMessagesPer10Min: number;
  /** Nombre maximal de beatmaps dans chacune des listes (favoris, à jouer plus tard). */
  listLimit: number;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { label: "Gratuit", stackMessagesPer10Min: 20, listLimit: 200 },
  premium: { label: "Premium", stackMessagesPer10Min: 100, listLimit: 1000 },
};

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
