import { incrementWindow } from "./store.server";

/**
 * Limiteur de débit à fenêtre fixe, partagé entre toutes les instances quand
 * une base Upstash est configurée (voir store.server.ts), sinon en mémoire.
 *
 * Protège la clé Gemini et le quota osu! d'un usage abusif.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  /**
   * `false` pour les routes très fréquentes et peu coûteuses (la recherche, déjà servie par le cache CDN) :
   * le compteur reste par instance, ce qui économise le quota gratuit de commandes Redis
   * (500 000 par mois chez Upstash) pour ce qui compte : Stack, l'écoute, les listes.
   */
  shared = true,
) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const { count, ttlSeconds } = await incrementWindow(`rl:${key}:${windowSeconds}`, windowSeconds, shared);

  if (count > limit) return { ok: false as const, retryAfterSeconds: ttlSeconds };
  return { ok: true as const, retryAfterSeconds: 0 };
}

/** Adresse du client, telle que transmise par Vercel (non usurpable depuis l'extérieur). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") || forwarded || "unknown";
}
