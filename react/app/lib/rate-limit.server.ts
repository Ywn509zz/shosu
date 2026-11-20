/**
 * Limiteur de débit en mémoire (fenêtre glissante).
 *
 * Protège la clé Gemini d'un usage abusif. Limite : l'état est propre à chaque
 * instance serverless, donc la limite effective est « par instance ». Pour une
 * garantie stricte, passer à un stockage partagé (Vercel KV / Upstash).
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false as const, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Évite que la table grossisse indéfiniment.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return { ok: true as const, retryAfterSeconds: 0 };
}
