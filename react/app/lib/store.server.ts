/**
 * Stockage clé/valeur partagé : Redis via l'API REST d'Upstash, avec repli en
 * mémoire quand aucune base n'est configurée.
 *
 * Variables acceptées (injectées par l'intégration Upstash de Vercel ou saisies à la main) :
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  ou  KV_REST_API_URL / KV_REST_API_TOKEN
 *
 * Sans base : tout fonctionne, mais l'état est propre à chaque instance serverless
 * et disparaît à son arrêt (favoris non persistants, limites de débit par instance).
 * Le reste du code ne doit jamais appeler Redis directement : il passe par ces fonctions.
 */

const restUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const restToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

/** Vrai si une vraie base est configurée (les données survivent aux redéploiements). */
export const isPersistent = () => Boolean(restUrl() && restToken());

type Command = (string | number)[];

async function redisPipeline(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${restUrl().replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${restToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);

  const results = (await response.json()) as { result?: unknown; error?: string }[];
  return results.map((entry) => {
    if (entry.error) throw new Error("Redis command failed");
    return entry.result;
  });
}

// --- Repli en mémoire ------------------------------------------------------
const counters = new Map<string, { count: number; expiresAt: number }>();
const hashes = new Map<string, Map<string, string>>();

/** Incrémente un compteur à fenêtre fixe et renvoie sa valeur et le temps restant. */
export async function incrementWindow(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; ttlSeconds: number }> {
  if (isPersistent()) {
    try {
      const [count, ttl] = (await redisPipeline([["INCR", key], ["TTL", key]])) as [number, number];
      let ttlSeconds = ttl;
      // Clé sans expiration (nouvelle, ou EXPIRE précédent perdu) : on la (re)pose, la limite ne reste jamais bloquée.
      if (ttl < 0) {
        await redisPipeline([["EXPIRE", key, windowSeconds]]);
        ttlSeconds = windowSeconds;
      }
      return { count, ttlSeconds };
    } catch {
      /* Redis indisponible : on retombe sur la mémoire plutôt que de laisser passer sans limite */
    }
  }

  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.expiresAt <= now) {
    counters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    if (counters.size > 5_000) {
      for (const [k, v] of counters) if (v.expiresAt <= now) counters.delete(k);
    }
    return { count: 1, ttlSeconds: windowSeconds };
  }
  current.count += 1;
  return { count: current.count, ttlSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)) };
}

/** Table de hachage (champ → texte). Utilisée pour les listes de beatmaps de chaque joueur. */
export const hash = {
  async set(key: string, field: string, value: string): Promise<void> {
    if (isPersistent()) {
      await redisPipeline([["HSET", key, field, value]]);
      return;
    }
    if (!hashes.has(key)) hashes.set(key, new Map());
    hashes.get(key)!.set(field, value);
  },

  async remove(key: string, field: string): Promise<void> {
    if (isPersistent()) {
      await redisPipeline([["HDEL", key, field]]);
      return;
    }
    hashes.get(key)?.delete(field);
  },

  async get(key: string, field: string): Promise<string | null> {
    if (isPersistent()) {
      const [value] = (await redisPipeline([["HGET", key, field]])) as [string | null];
      return value ?? null;
    }
    return hashes.get(key)?.get(field) ?? null;
  },

  async has(key: string, field: string): Promise<boolean> {
    if (isPersistent()) {
      const [exists] = (await redisPipeline([["HEXISTS", key, field]])) as [number];
      return exists === 1;
    }
    return hashes.get(key)?.has(field) ?? false;
  },

  async getAll(key: string): Promise<Record<string, string>> {
    if (isPersistent()) {
      const [flat] = (await redisPipeline([["HGETALL", key]])) as [string[] | Record<string, string>];
      if (Array.isArray(flat)) {
        const out: Record<string, string> = {};
        for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
        return out;
      }
      return flat ?? {};
    }
    return Object.fromEntries(hashes.get(key) ?? []);
  },

  async length(key: string): Promise<number> {
    if (isPersistent()) {
      const [n] = (await redisPipeline([["HLEN", key]])) as [number];
      return n;
    }
    return hashes.get(key)?.size ?? 0;
  },
};
