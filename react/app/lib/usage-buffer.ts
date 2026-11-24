/**
 * Compteurs d'usage en mémoire (sans dépendance), vidés dans Redis par `store.server.ts` : commandes Redis, appels à l'API osu!,
 * requêtes et jetons Gemini, messages Stack, extraits écoutés. Sert au tableau de bord des quotas (`/admin`).
 */
export type UsageKind = "redis" | "osu" | "gemini" | "geminiIn" | "geminiOut" | "stack" | "listen";

const buffer: Record<string, number> = {};

export function bump(kind: UsageKind, amount = 1): void {
  if (amount > 0) buffer[kind] = (buffer[kind] ?? 0) + amount;
}

/** Renvoie les compteurs accumulés et les remet à zéro. */
export function drain(): Record<string, number> {
  const copy = { ...buffer };
  for (const key of Object.keys(buffer)) delete buffer[key];
  return copy;
}
