import { cached } from "./cache.server";
import { API_MODE, type Beatmapset } from "./osu";
import { osuGet, toBeatmapset, type RawBeatmapset } from "./osu.server";
import { getUserRaw } from "./player-data.server";

/**
 * Données publiques du compte osu! du joueur connecté, pour Stack : tout ce que montre son profil sur osu.ppy.sh
 * (statistiques de chaque mode, historique de rang, badges, succès, scores, beatmaps, activité).
 *
 * Rien de privé : la connexion à shOsu! ne demande que la permission « identify » ; on ne voit ni la liste d'amis,
 * ni les messages, ni l'e-mail. Les textes libres du profil sont bornés et nettoyés avant d'être transmis au modèle.
 */

const MODES = ["osu", "taiko", "fruits", "mania"] as const;
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const round = (value: unknown, digits = 2): number | null => {
  const n = num(value);
  return n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits;
};
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return clean || null;
};
const day = (value: unknown): string | null =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
const modName = (mod: string | { acronym: string }) => (typeof mod === "string" ? mod : mod.acronym);
const safe = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await task;
  } catch {
    return fallback;
  }
};

type RawStats = {
  pp?: number;
  global_rank?: number | null;
  country_rank?: number | null;
  hit_accuracy?: number;
  play_count?: number;
  play_time?: number;
  ranked_score?: number;
  total_score?: number;
  total_hits?: number;
  maximum_combo?: number;
  replays_watched_by_others?: number;
  level?: { current?: number; progress?: number };
  grade_counts?: { ss?: number; ssh?: number; s?: number; sh?: number; a?: number };
  is_ranked?: boolean;
};

type RawAccount = {
  id: number;
  username: string;
  country_code?: string;
  country?: { name?: string };
  join_date?: string;
  last_visit?: string | null;
  is_online?: boolean;
  playmode?: string;
  playstyle?: string[] | null;
  title?: string | null;
  location?: string | null;
  interests?: string | null;
  occupation?: string | null;
  website?: string | null;
  previous_usernames?: string[];
  follower_count?: number;
  mapping_follower_count?: number;
  ranked_beatmapset_count?: number;
  loved_beatmapset_count?: number;
  graveyard_beatmapset_count?: number;
  pending_beatmapset_count?: number;
  guest_beatmapset_count?: number;
  favourite_beatmapset_count?: number;
  scores_best_count?: number;
  scores_first_count?: number;
  scores_recent_count?: number;
  beatmap_playcounts_count?: number;
  kudosu?: { total?: number; available?: number };
  badges?: { description?: string; awarded_at?: string }[];
  user_achievements?: unknown[];
  groups?: { name?: string }[];
  rank_highest?: { rank?: number; updated_at?: string };
  rank_history?: { mode?: string; data?: number[] };
  monthly_playcounts?: { start_date?: string; count?: number }[];
  statistics?: RawStats;
};

function modeStats(stats: RawStats | undefined) {
  const s = stats ?? {};
  const played = (num(s.play_count) ?? 0) > 0 || (num(s.pp) ?? 0) > 0;
  if (!played) return null;
  return {
    pp: round(s.pp, 0),
    globalRank: num(s.global_rank),
    countryRank: num(s.country_rank),
    accuracy: round(s.hit_accuracy),
    playCount: num(s.play_count),
    playTimeHours: s.play_time === undefined ? null : Math.round((num(s.play_time) ?? 0) / 3600),
    level: round(s.level?.current, 0),
    rankedScore: num(s.ranked_score),
    totalHits: num(s.total_hits),
    maxCombo: num(s.maximum_combo),
    replaysWatched: num(s.replays_watched_by_others),
    grades: {
      ss: (s.grade_counts?.ss ?? 0) + (s.grade_counts?.ssh ?? 0),
      s: (s.grade_counts?.s ?? 0) + (s.grade_counts?.sh ?? 0),
      a: s.grade_counts?.a ?? 0,
    },
  };
}

/** Évolution du rang mondial sur les ~90 derniers jours (le tableau d'osu! va du plus ancien au plus récent ; 0 = non classé). */
function rankTrend(data: number[] | undefined) {
  const ranks = (data ?? []).filter((r) => typeof r === "number" && r > 0);
  if (ranks.length < 2) return null;
  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  return {
    days: data?.length ?? ranks.length,
    from: first,
    to: last,
    best: Math.min(...ranks),
    worst: Math.max(...ranks),
    direction: last < first ? "monte" : last > first ? "descend" : "stable",
  };
}

/** Vue d'ensemble : identité publique, statistiques des quatre modes, historique de rang, badges, compteurs, activité mensuelle. */
export function getAccountOverview(osuId: number) {
  return cached(`account:${osuId}`, 5 * 60_000, async () => {
    const results = await Promise.all(
      MODES.map((mode) =>
        safe(osuGet<RawAccount>(`/users/${osuId}/${mode}`, { key: "id" }), null as RawAccount | null),
      ),
    );
    const base = results.find((r): r is RawAccount => r !== null);
    if (!base) throw new Error("account unavailable");

    const modes: Record<string, ReturnType<typeof modeStats>> = {};
    const trends: Record<string, ReturnType<typeof rankTrend>> = {};
    results.forEach((user, index) => {
      modes[MODES[index]] = modeStats(user?.statistics);
      const trend = rankTrend(user?.rank_history?.data);
      if (trend) trends[MODES[index]] = trend;
    });

    const monthly = (base.monthly_playcounts ?? [])
      .slice(-12)
      .map((m) => ({ month: String(m.start_date ?? "").slice(0, 7), plays: num(m.count) ?? 0 }));

    return {
      username: text(base.username, 30),
      country: text(base.country?.name, 40) ?? base.country_code ?? null,
      title: text(base.title, 60),
      joined: day(base.join_date),
      lastVisit: day(base.last_visit),
      online: base.is_online === true,
      mainMode: base.playmode ?? "osu",
      playstyle: (base.playstyle ?? []).slice(0, 5),
      previousUsernames: (base.previous_usernames ?? []).slice(0, 5).map((n) => text(n, 30) ?? ""),
      profile: {
        location: text(base.location, 60),
        interests: text(base.interests, 120),
        occupation: text(base.occupation, 60),
        website: text(base.website, 80),
      },
      followers: num(base.follower_count),
      mappingFollowers: num(base.mapping_follower_count),
      kudosu: { total: num(base.kudosu?.total), available: num(base.kudosu?.available) },
      groups: (base.groups ?? []).slice(0, 5).map((g) => text(g.name, 40) ?? ""),
      badges: {
        count: (base.badges ?? []).length,
        recent: (base.badges ?? [])
          .slice(-5)
          .map((b) => ({ description: text(b.description, 80), awarded: day(b.awarded_at) })),
      },
      achievements: (base.user_achievements ?? []).length,
      beatmapsCreated: {
        ranked: num(base.ranked_beatmapset_count),
        loved: num(base.loved_beatmapset_count),
        pending: num(base.pending_beatmapset_count),
        graveyard: num(base.graveyard_beatmapset_count),
        guestDifficulties: num(base.guest_beatmapset_count),
      },
      favouriteBeatmapsets: num(base.favourite_beatmapset_count),
      scoreCounts: {
        best: num(base.scores_best_count),
        firstPlaces: num(base.scores_first_count),
        recent: num(base.scores_recent_count),
      },
      distinctBeatmapsPlayed: num(base.beatmap_playcounts_count),
      highestRank: base.rank_highest?.rank
        ? { rank: base.rank_highest.rank, date: day(base.rank_highest.updated_at) }
        : null,
      modes,
      rankTrend90Days: trends,
      monthlyPlays: monthly,
    };
  });
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export const SCORE_TYPES = ["best", "recent", "firsts", "pinned"] as const;
export type ScoreType = (typeof SCORE_TYPES)[number];

type RawScore = {
  pp?: number | null;
  accuracy?: number;
  rank?: string;
  max_combo?: number;
  passed?: boolean;
  created_at?: string;
  mods?: (string | { acronym: string })[];
  statistics?: { count_miss?: number; miss?: number };
  beatmap?: {
    version?: string;
    mode?: string;
    difficulty_rating: number;
    bpm?: number;
    total_length?: number;
    max_combo?: number;
  };
  beatmapset?: RawBeatmapset;
  weight?: { percentage?: number };
};

export async function getAccountScores(
  osuId: number,
  params: { type: ScoreType; mode: string; limit: number; offset: number; includeFails?: boolean },
) {
  const query: Record<string, string> = {
    mode: params.mode,
    limit: String(params.limit),
    offset: String(params.offset),
  };
  if (params.type === "recent") query.include_fails = params.includeFails ? "1" : "0";
  const scores = await cached(
    `scores:${osuId}:${params.type}:${params.mode}:${params.limit}:${params.offset}:${query.include_fails ?? ""}`,
    2 * 60_000,
    () => osuGet<RawScore[]>(`/users/${osuId}/scores/${params.type}`, query),
  );

  const sets: Beatmapset[] = [];
  const items = scores
    .filter((s) => s.beatmap && s.beatmapset)
    .map((s) => {
      const set = toBeatmapset({
        ...s.beatmapset!,
        beatmaps: [{ mode: s.beatmap!.mode ?? params.mode, difficulty_rating: s.beatmap!.difficulty_rating }],
      });
      sets.push(set);
      return {
        beatmapsetId: set.id,
        title: text(s.beatmapset!.title, 80),
        artist: text(s.beatmapset!.artist, 60),
        difficulty: text(s.beatmap!.version, 50),
        stars: round(s.beatmap!.difficulty_rating),
        mods: (s.mods ?? []).map(modName),
        pp: round(s.pp, 0),
        accuracy: s.accuracy === undefined ? null : round(s.accuracy * 100),
        rank: s.rank ?? null,
        combo: num(s.max_combo),
        maxCombo: num(s.beatmap!.max_combo),
        misses: num(s.statistics?.count_miss ?? s.statistics?.miss),
        passed: s.passed !== false,
        date: day(s.created_at),
        weightPercent: round(s.weight?.percentage, 0),
      };
    });
  return { items, sets };
}

// ---------------------------------------------------------------------------
// Beatmaps du compte (favorites, créées, très jouées…)
// ---------------------------------------------------------------------------

export const BEATMAP_TYPES = [
  "favourite",
  "ranked",
  "loved",
  "pending",
  "graveyard",
  "guest",
  "nominated",
  "most_played",
] as const;
export type BeatmapType = (typeof BEATMAP_TYPES)[number];

type RawMostPlayed = {
  beatmap_id?: number;
  count?: number;
  beatmap?: { version?: string; difficulty_rating: number; mode?: string };
  beatmapset?: RawBeatmapset;
};

export async function getAccountBeatmaps(osuId: number, params: { type: BeatmapType; limit: number; offset: number }) {
  const query = { limit: String(params.limit), offset: String(params.offset) };
  const key = `account-maps:${osuId}:${params.type}:${params.limit}:${params.offset}`;

  if (params.type === "most_played") {
    const raw = await cached(key, 5 * 60_000, () =>
      osuGet<RawMostPlayed[]>(`/users/${osuId}/beatmapsets/most_played`, query),
    );
    const sets: Beatmapset[] = [];
    const items = raw
      .filter((m) => m.beatmapset)
      .map((m) => {
        const set = toBeatmapset({
          ...m.beatmapset!,
          beatmaps: m.beatmap
            ? [{ mode: m.beatmap.mode ?? "osu", difficulty_rating: m.beatmap.difficulty_rating }]
            : m.beatmapset!.beatmaps,
        });
        sets.push(set);
        return {
          beatmapsetId: set.id,
          title: text(set.title, 80),
          artist: text(set.artist, 60),
          difficulty: text(m.beatmap?.version, 50),
          stars: round(m.beatmap?.difficulty_rating),
          timesPlayed: num(m.count),
        };
      });
    return { items, sets };
  }

  const raw = await cached(key, 5 * 60_000, () =>
    osuGet<RawBeatmapset[]>(`/users/${osuId}/beatmapsets/${params.type}`, query),
  );
  const sets = raw.map(toBeatmapset);
  const items = sets.map((set) => ({
    beatmapsetId: set.id,
    title: text(set.title, 80),
    artist: text(set.artist, 60),
    creator: text(set.creator, 30),
    status: set.status,
    stars: [set.minStars, set.maxStars].map((s) => round(s, 1)),
  }));
  return { items, sets };
}

// ---------------------------------------------------------------------------
// Activité récente
// ---------------------------------------------------------------------------

type RawEvent = {
  type?: string;
  created_at?: string;
  scoreRank?: string;
  rank?: number;
  mode?: string;
  count?: number;
  achievement?: { name?: string; description?: string };
  beatmap?: { title?: string };
  beatmapset?: { title?: string };
  user?: { username?: string; previousUsername?: string };
};

export async function getAccountActivity(osuId: number, limit: number) {
  const events = await cached(`activity:${osuId}:${limit}`, 3 * 60_000, () =>
    osuGet<RawEvent[]>(`/users/${osuId}/recent_activity`, { limit: String(limit) }),
  );
  return events.map((e) => ({
    type: text(e.type, 30),
    date: day(e.created_at),
    mode: e.mode && e.mode in API_MODE ? e.mode : null,
    rank: num(e.rank),
    grade: text(e.scoreRank, 4),
    beatmap: text(e.beatmap?.title ?? e.beatmapset?.title, 80),
    achievement: text(e.achievement?.name, 60),
    previousUsername: text(e.user?.previousUsername, 30),
  }));
}
