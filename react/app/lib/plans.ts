/**
 * Formules de shOsu! : définitions partagées entre serveur et navigateur.
 *
 * Modifier ici les limites de chaque plan. Le site est entièrement gratuit : le Premium est attribué
 * sur invitation (voir plans.server.ts) et il n'y a aucun paiement. Si un jour des abonnements voient
 * le jour, ils se brancheront sur `setPlan`.
 */
export const PLAN_IDS = ["free", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanDefinition = {
  label: string;
  /** Messages envoyés à Stack par fenêtre de 10 minutes. */
  stackMessagesPer10Min: number;
  /** Nombre maximal de beatmaps dans chaque liste (favoris, à jouer plus tard) et dans chaque collection. */
  listLimit: number;
  /** Nombre maximal de collections personnalisées (listes nommées, partageables). */
  collectionLimit: number;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: { label: "Gratuit", stackMessagesPer10Min: 20, listLimit: 200, collectionLimit: 5 },
  premium: { label: "Premium", stackMessagesPer10Min: 100, listLimit: 1000, collectionLimit: 25 },
};

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
