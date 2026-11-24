import { cached } from "./cache.server";
import type { ModeSummary, ProgressData, ProgressPoint } from "./insights";
import { osuGet } from "./osu.server";
import { hash } from "./store.server";

/**
 * Suivi de progression d'un joueur.
 *
 * Deux sources :
 *  - osu! : rang mondial des ~90 derniers jours et parties par mois (disponibles pour n'importe quel joueur) ;
 *  - des **relevés quotidiens shOsu!** (pp, rang, précision, parties) pour les joueurs connectés à shOsu!, gardés dans Redis
 *    (`shosu:snap:<osuId>`, champ `<mode>:<AAAA-MM-JJ>`). osu! ne donne pas l'historique des pp : on le construit jour après jour.
 *
 * Les relevés ne sont écrits que pour le joueur connecté lui-même (POST /api/progress ou lecture de son compte par Stack) :
 * une consultation anonyme n'écrit jamais dans Redis.
 */

export const MODES = ["osu", "taiko", "fruits", "mania"] as const;
const MAX_SNAPSHOT_DAYS = 120;
const snapKey = (osuId: number) => `shosu:snap:${osuId}`;

type RawUser = {
  id: number;
  username: string;
  rank_history?: { data?: number[] };
  monthly_playcounts?: { start_date?: string; count?: number }[];
  statistics?: {
    pp?: number;
    global_rank?: number | null;
    country_rank?: number | null;
    hit_accuracy?: number;
    play_count?: number;
    play_time?: number;
    level?: { current?: number };
  };
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const round = (value: unknown, digits = 2): number | null => {
  const n = num(value);
  return n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function fetchMode(playerId: number, mode: string): Promise<RawUser | null> {
  return cached(`progress-user:${playerId}:${mode}`, 5 * 60_000, async () => {
    try {
      return await osuGet<RawUser>(`/users/${playerId}/${mode}`, { key: "id" });
    } catch {
      return null;
    }
  });
}

const played = (user: RawUser | null) =>
  Boolean(user && ((num(user.statistics?.play_count) ?? 0) > 0 || (num(user.statistics?.pp) ?? 0) > 0));

function summarize(mode: string, user: RawUser | null): ModeSummary {
  const s = user?.statistics;
  return {
    mode,
    played: played(user),
    plays: num(s?.play_count) ?? 0,
    hours: Math.round((num(s?.play_time) ?? 0) / 3600),
    pp: round(s?.pp, 0),
    rank: num(s?.global_rank),
  };
}

function parseSnapshots(all: Record<string, string>, mode: string): ProgressPoint[] {
  const points: ProgressPoint[] = [];
  for (const [field, raw] of Object.entries(all)) {
    const [fieldMode, date] = field.split(":");
    if (fieldMode !== mode || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) continue;
    try {
      const v = JSON.parse(raw) as Partial<ProgressPoint>;
      points.push({ date, pp: num(v.pp), rank: num(v.rank), accuracy: num(v.accuracy), plays: num(v.plays) });
    } catch {
      /* relevé illisible : ignoré */
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Dernier relevé daté d'au moins `days` jours (avec un recul maximal de `days + 10`). */
function pointBefore(points: ProgressPoint[], days: number): ProgressPoint | null {
  const limit = daysAgo(days);
  const oldest = daysAgo(days + 10);
  const candidates = points.filter((p) => p.date <= limit && p.date >= oldest);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

export async function getProgress(playerId: number, mode: string): Promise<ProgressData> {
  const users = await Promise.all(MODES.map((m) => fetchMode(playerId, m)));
  const index = MODES.indexOf(mode as (typeof MODES)[number]);
  const user = users[index < 0 ? 0 : index];
  const base = users.find((u): u is RawUser => u !== null);
  if (!base) throw new Error("player unavailable");

  const s = user?.statistics;
  const current = played(user)
    ? {
        pp: round(s?.pp, 0),
        rank: num(s?.global_rank),
        countryRank: num(s?.country_rank),
        accuracy: round(s?.hit_accuracy),
        plays: num(s?.play_count),
        hours: s?.play_time === undefined ? null : Math.round((num(s.play_time) ?? 0) / 3600),
        level: round(s?.level?.current, 0),
      }
    : null;

  const rankHistory = (user?.rank_history?.data ?? []).map((r) => (typeof r === "number" && r > 0 ? r : null));
  const monthly = (user?.monthly_playcounts ?? [])
    .slice(-18)
    .map((m) => ({ month: String(m.start_date ?? "").slice(0, 7), plays: num(m.count) ?? 0 }))
    .filter((m) => /^\d{4}-\d{2}$/.test(m.month));

  let snapshots: ProgressPoint[] = [];
  let tracked = false;
  try {
    const all = await hash.getAll(snapKey(playerId));
    tracked = Object.keys(all).length > 0;
    snapshots = parseSnapshots(all, MODES[index < 0 ? 0 : index]);
  } catch {
    /* Redis indisponible : le suivi osu! (rang, parties) reste affiché */
  }

  const rankAt = (days: number) => {
    const value = rankHistory[rankHistory.length - 1 - days];
    return value ?? null;
  };
  const rankNow = current?.rank ?? rankHistory[rankHistory.length - 1] ?? null;
  const delta = (before: number | null | undefined, now: number | null | undefined) =>
    before == null || now == null ? null : Math.round((now - before) * 100) / 100;

  const p7 = pointBefore(snapshots, 7);
  const p30 = pointBefore(snapshots, 30);

  return {
    playerId,
    username: String(base.username).slice(0, 30),
    mode: MODES[index < 0 ? 0 : index],
    current,
    modes: MODES.map((m, i) => summarize(m, users[i])),
    rankHistory,
    monthly,
    snapshots,
    tracking: { tracked, since: snapshots[0]?.date ?? null, points: snapshots.length },
    deltas: {
      // Rang : négatif = a progressé (un meilleur rang est un nombre plus petit).
      rank7: delta(rankAt(7), rankNow),
      rank30: delta(rankAt(30), rankNow),
      pp7: delta(p7?.pp, current?.pp),
      pp30: delta(p30?.pp, current?.pp),
      plays7: delta(p7?.plays, current?.plays),
      plays30: delta(p30?.plays, current?.plays),
      accuracy30: delta(p30?.accuracy, current?.accuracy),
    },
  };
}

const lastRecorded = new Map<number, string>();

/** Efface tous les relevés quotidiens du joueur. */
export async function deleteSnapshots(osuId: number): Promise<void> {
  await hash.del(snapKey(osuId));
  lastRecorded.delete(osuId);
}

/** Relevés bruts du joueur (champ `<mode>:<date>` → valeur), pour l'export de ses données. */
export async function exportSnapshots(osuId: number): Promise<Record<string, unknown>> {
  const all = await hash.getAll(snapKey(osuId));
  const out: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(all)) {
    try {
      out[field] = JSON.parse(raw);
    } catch {
      /* relevé illisible : ignoré */
    }
  }
  return out;
}

/** Enregistre le relevé du jour pour chaque mode joué. À n'appeler que pour le joueur connecté lui-même. */
export async function recordSnapshot(osuId: number): Promise<number> {
  const date = today();
  if (lastRecorded.get(osuId) === date) return 0;

  const users = await Promise.all(MODES.map((m) => fetchMode(osuId, m)));
  const entries: Record<string, string> = {};
  users.forEach((user, i) => {
    if (!played(user)) return;
    const s = user!.statistics!;
    const point: Omit<ProgressPoint, "date"> = {
      pp: round(s.pp, 0),
      rank: num(s.global_rank),
      accuracy: round(s.hit_accuracy),
      plays: num(s.play_count),
    };
    entries[`${MODES[i]}:${date}`] = JSON.stringify(point);
  });
  if (Object.keys(entries).length === 0) return 0;

  await hash.setMany(snapKey(osuId), entries);
  lastRecorded.set(osuId, date);

  // Ménage occasionnel : on ne garde que ~4 mois de relevés par mode.
  if (Math.random() < 0.1) {
    const all = await hash.getAll(snapKey(osuId));
    const cutoff = daysAgo(MAX_SNAPSHOT_DAYS);
    await Promise.all(
      Object.keys(all)
        .filter((field) => (field.split(":")[1] ?? "") < cutoff)
        .map((field) => hash.remove(snapKey(osuId), field)),
    );
  }
  return Object.keys(entries).length;
}
