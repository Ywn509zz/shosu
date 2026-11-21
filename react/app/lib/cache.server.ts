/**
 * Petit cache mémoire à durée de vie courte, avec déduplication des appels en vol.
 * Propre à chaque instance serverless : il économise le quota osu! et accélère les
 * recherches répétées, sans jamais servir de données propres à un utilisateur.
 */
const entries = new Map<string, { value: unknown; expiresAt: number }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      if (entries.size > MAX_ENTRIES) {
        const cutoff = Date.now();
        for (const [k, v] of entries) if (v.expiresAt <= cutoff) entries.delete(k);
        // Toujours trop plein : on retire les plus anciennes entrées.
        for (const k of entries.keys()) {
          if (entries.size <= MAX_ENTRIES) break;
          entries.delete(k);
        }
      }
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
