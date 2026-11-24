import { cached } from "./cache.server";
import type { PlayHabits, Recommendations } from "./insights";
import { API_MODE, type Beatmapset } from "./osu";
import { osuGet, toBeatmapset, type RawBeatmapset } from "./osu.server";
import { usefulTags } from "./similar";

type RawBeatmap = { difficulty_rating: number; mode: string; bpm?: number; total_length?: number };
type RawScoreSet = { id?: number; artist?: string; tags?: string };
type RawScore = {
  mods?: (string | { acronym: string })[];
  beatmap?: RawBeatmap & { beatmapset_id?: number };
  beatmapset?: RawScoreSet;
};
type RawSet = Omit<RawBeatmapset, "beatmaps"> & {
  beatmaps?: RawBeatmap[];
  tags?: string;
  play_count?: number;
  favourite_count?: number;
};
type RawMostPlayed = { count?: number; beatmapset?: RawScoreSet };

const MODES = ["osu", "taiko", "fruits", "mania"];
const MAX_ITEMS = 12;
const MAX_PER_ARTIST = 2;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const round1 = (value: number) => Math.round(value * 10) / 10;
const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Mode principal du joueur d'après son profil osu!. */
async function mainMode(osuId: number): Promise<string> {
  try {
    const user = await osuGet<{ playmode?: string }>(`/users/${osuId}`, { key: "id" });
    return user.playmode && MODES.includes(user.playmode) ? user.playmode : "osu";
  } catch {
    return "osu";
  }
}

async function safe<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch {
    return fallback;
  }
}

type Gathered = {
  habits: PlayHabits | null;
  /** Beatmaps déjà jouées, favorites ou très jouées : elles ne sont jamais recommandées. */
  known: Set<number>;
};

async function gatherHabits(osuId: number, mode: string): Promise<Gathered> {
  const id = String(osuId);
  const [best, recent, mostPlayed, favourites] = await Promise.all([
    safe(osuGet<RawScore[]>(`/users/${id}/scores/best`, { mode, limit: "100" }), []),
    safe(osuGet<RawScore[]>(`/users/${id}/scores/recent`, { mode, limit: "50" }), []),
    safe(osuGet<RawMostPlayed[]>(`/users/${id}/beatmapsets/most_played`, { limit: "50" }), []),
    safe(osuGet<RawSet[]>(`/users/${id}/beatmapsets/favourite`, { limit: "50" }), []),
  ]);

  const known = new Set<number>();
  for (const s of [...best, ...recent]) {
    const setId = s.beatmapset?.id ?? s.beatmap?.beatmapset_id;
    if (setId) known.add(setId);
  }
  for (const m of mostPlayed) if (m.beatmapset?.id) known.add(m.beatmapset.id);
  for (const f of favourites) known.add(f.id);

  const scored = best.filter((s) => s.beatmap);
  if (scored.length === 0) return { habits: null, known };

  const stars = scored.map((s) => s.beatmap!.difficulty_rating);
  const bpms = scored.map((s) => s.beatmap!.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const lengths = scored.map((s) => s.beatmap!.total_length).filter((l): l is number => typeof l === "number" && l > 0);

  const modCount = new Map<string, number>();
  for (const s of scored) {
    for (const mod of s.mods ?? []) {
      const acronym = typeof mod === "string" ? mod : mod.acronym;
      if (acronym && !["NF", "SD", "PF"].includes(acronym)) modCount.set(acronym, (modCount.get(acronym) ?? 0) + 1);
    }
  }
  const mods = [...modCount.entries()]
    .map(([mod, count]) => ({ mod, share: Math.round((count / scored.length) * 100) / 100 }))
    .filter((m) => m.share >= 0.1)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);

  // Artistes préférés : meilleurs scores, beatmaps très jouées (pondérées par le nombre de parties) et favoris.
  const artistWeight = new Map<string, { name: string; weight: number }>();
  const bump = (artist: string | undefined, weight: number) => {
    const key = norm(artist ?? "");
    if (key.length < 2) return;
    const current = artistWeight.get(key) ?? { name: String(artist).slice(0, 60), weight: 0 };
    current.weight += weight;
    artistWeight.set(key, current);
  };
  for (const s of scored) bump(s.beatmapset?.artist, 1);
  for (const m of mostPlayed) bump(m.beatmapset?.artist, Math.min(3, 1 + Math.log10(Math.max(1, m.count ?? 1))));
  for (const f of favourites) bump(f.artist, 2);
  const artists = [...artistWeight.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((a) => a.name);

  // Tags préférés : ceux des beatmaps favorites.
  const tagCount = new Map<string, number>();
  for (const f of favourites) {
    for (const tag of usefulTags(
      String(f.tags ?? "")
        .split(/\s+/)
        .filter(Boolean),
      f.artist,
    )) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCount.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);

  const med = median(stars)!;
  const bpm = median(bpms);
  const length = median(lengths);
  return {
    known,
    habits: {
      plays: scored.length,
      stars: { median: round1(med), low: round1(quantile(stars, 0.25)), high: round1(quantile(stars, 0.75)) },
      bpm: bpm === null ? null : Math.round(bpm),
      lengthSeconds: length === null ? null : Math.round(length),
      mods,
      artists,
      tags,
    },
  };
}

function searchRaw(params: Record<string, string>): Promise<RawSet[]> {
  const key = `reco-search:${JSON.stringify(params)}`;
  return cached(key, 10 * 60_000, async () => {
    const data = await osuGet<{ beatmapsets?: RawSet[] }>("/beatmapsets/search", params);
    return data.beatmapsets ?? [];
  });
}

/**
 * Recommandations d'après les habitudes de jeu : on cherche autour des artistes et des tags que le joueur aime et dans
 * les beatmaps populaires, on garde celles dont une difficulté tombe dans sa zone habituelle (un peu au-dessus pour progresser),
 * et on classe selon la difficulté, le BPM, les artistes, les tags et la popularité. Les beatmaps déjà jouées sont exclues.
 */
export function getRecommendations(osuId: number, requestedMode?: string): Promise<Recommendations> {
  return cached(`reco:${osuId}:${requestedMode ?? "main"}`, 15 * 60_000, async () => {
    const mode = requestedMode && MODES.includes(requestedMode) ? requestedMode : await mainMode(osuId);
    const { habits, known } = await gatherHabits(osuId, mode);
    if (!habits) return { mode, habits: null, items: [] };

    const m = String(API_MODE[mode]);
    const queries: Record<string, string>[] = [
      ...habits.artists.slice(0, 3).map((q) => ({ q, m })),
      ...habits.tags.slice(0, 3).map((q) => ({ q, m })),
      { q: "", m, s: "ranked", sort: "plays_desc" },
    ];
    const pools = await Promise.all(queries.map((params) => safe(searchRaw(params), [])));

    const target = habits.stars.median + 0.3;
    const zoneMin = Math.max(0.5, habits.stars.low - 0.4);
    const zoneMax = habits.stars.high + 0.7;
    const artistKeys = new Map(habits.artists.map((a, i) => [norm(a), i]));
    const wantedTags = new Set(habits.tags);

    const scoredSets: { set: Beatmapset; score: number; reasons: string[]; artist: string }[] = [];
    const seen = new Set<number>();
    for (const pool of pools) {
      for (const raw of pool) {
        if (seen.has(raw.id) || known.has(raw.id)) continue;
        seen.add(raw.id);

        const diffs = (raw.beatmaps ?? []).filter((b) => b.mode.toLowerCase() === mode);
        const fitting = diffs.filter((b) => b.difficulty_rating >= zoneMin && b.difficulty_rating <= zoneMax);
        if (fitting.length === 0) continue;

        const reasons: string[] = [];
        const best = fitting.reduce((a, b) =>
          Math.abs(b.difficulty_rating - target) < Math.abs(a.difficulty_rating - target) ? b : a,
        );
        let score = Math.max(0, 1 - Math.abs(best.difficulty_rating - target) / 2) * 40;
        reasons.push(
          `Une difficulté à ${best.difficulty_rating.toFixed(1)}★, dans ta zone (${habits.stars.low.toFixed(1)}–${habits.stars.high.toFixed(1)}★)`,
        );

        const artistRank = artistKeys.get(norm(raw.artist));
        if (artistRank !== undefined) {
          score += 28 - artistRank * 4;
          reasons.push(`Artiste que tu joues souvent : ${raw.artist}`);
        }

        const tags = new Set(
          usefulTags(
            String(raw.tags ?? "")
              .split(/\s+/)
              .filter(Boolean),
            raw.artist,
          ),
        );
        const sharedTags = [...wantedTags].filter((tag) => tags.has(tag));
        if (sharedTags.length > 0) {
          score += Math.min(18, sharedTags.length * 9);
          reasons.push(`Tags de tes favoris : ${sharedTags.slice(0, 2).join(", ")}`);
        }

        if (habits.bpm && typeof raw.bpm === "number" && raw.bpm > 0) {
          const gap = Math.abs(raw.bpm - habits.bpm) / habits.bpm;
          if (gap <= 0.25) {
            score += Math.round(12 * (1 - gap / 0.25));
            if (gap <= 0.1) reasons.push(`BPM habituel (≈ ${Math.round(raw.bpm)})`);
          }
        }
        if (habits.lengthSeconds) {
          const length = diffs.length ? Math.max(...diffs.map((b) => b.total_length ?? 0)) : 0;
          if (length > 0) {
            const gap = Math.abs(length - habits.lengthSeconds) / habits.lengthSeconds;
            if (gap <= 0.4) score += Math.round(6 * (1 - gap / 0.4));
          }
        }
        if (typeof raw.play_count === "number" && raw.play_count > 0)
          score += Math.min(8, (Math.log10(raw.play_count) / 6) * 8);

        scoredSets.push({
          set: toBeatmapset(raw),
          score: Math.min(100, Math.round(score)),
          reasons: reasons.slice(0, 3),
          artist: norm(raw.artist),
        });
      }
    }

    // Du meilleur au moins bon, en limitant les doublons d'artiste pour garder de la variété.
    scoredSets.sort((a, b) => b.score - a.score);
    const perArtist = new Map<string, number>();
    const items: Recommendations["items"] = [];
    for (const entry of scoredSets) {
      const count = perArtist.get(entry.artist) ?? 0;
      if (count >= MAX_PER_ARTIST) continue;
      perArtist.set(entry.artist, count + 1);
      items.push({ ...entry.set, score: entry.score, reasons: entry.reasons });
      if (items.length >= MAX_ITEMS) break;
    }
    return { mode, habits, items };
  });
}
