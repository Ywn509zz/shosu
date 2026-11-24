import { cached } from "./cache.server";
import type { SimilarMap } from "./insights";
import { getBeatmapset, osuGet, toBeatmapset, type RawBeatmapset } from "./osu.server";
import { GENRES, LANGUAGES, scoreSimilarity, usefulTags, type SimilarityFocus, type SimilarityInput } from "./similar";

type RawSearchSet = RawBeatmapset & {
  tags?: string;
  source?: string;
  genre?: { name?: string } | null;
  language?: { name?: string } | null;
  genre_id?: number;
  language_id?: number;
};

const MAX_RESULTS = 12;
const MIN_SCORE = 22;
const MIN_SCORE_SOUND = 26;

function searchRaw(q: string): Promise<RawSearchSet[]> {
  return cached(`similar-search:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const data = await osuGet<{ beatmapsets?: RawSearchSet[] }>("/beatmapsets/search", { q });
    return data.beatmapsets ?? [];
  });
}

function toInput(raw: RawSearchSet): SimilarityInput {
  const base = toBeatmapset(raw);
  return {
    id: base.id,
    artist: base.artist,
    creator: base.creator,
    source: String(raw.source ?? ""),
    tags: String(raw.tags ?? "").split(/\s+/).filter(Boolean).slice(0, 40),
    genre: raw.genre?.name ?? (raw.genre_id ? (GENRES[raw.genre_id] ?? null) : null),
    language: raw.language?.name ?? (raw.language_id ? (LANGUAGES[raw.language_id] ?? null) : null),
    bpm: base.bpm ?? null,
    minStars: base.minStars,
    maxStars: base.maxStars,
    modes: base.modes,
  };
}

/**
 * Beatmaps qui ressemblent à celle-ci : on cherche chez osu! autour de son artiste, de sa source et de ses tags
 * les plus distinctifs, puis on classe les candidats avec `scoreSimilarity` (artiste, tags, BPM, difficulté…).
 */
export function findSimilar(setId: number, focus: SimilarityFocus = "mix"): Promise<SimilarMap[]> {
  return cached(`similar:${setId}:${focus}`, 10 * 60_000, async () => {
    const set = await getBeatmapset(setId);
    const base: SimilarityInput = {
      id: set.id,
      artist: set.artist,
      creator: set.creator,
      source: set.source ?? "",
      tags: set.tags,
      genre: set.genre,
      language: set.language,
      bpm: set.bpm,
      minStars: set.minStars,
      maxStars: set.maxStars,
      modes: set.modes,
    };

    const queries = [set.artist, set.source ?? "", ...usefulTags(set.tags, set.artist).slice(0, focus === "sound" ? 3 : 2)]
      .map((q) => q.trim())
      .filter((q, i, all) => q.length >= 2 && all.indexOf(q) === i)
      .slice(0, 4);

    const pools = await Promise.allSettled(queries.map((q) => searchRaw(q)));
    const candidates = new Map<number, RawSearchSet>();
    for (const pool of pools) {
      if (pool.status !== "fulfilled") continue;
      for (const raw of pool.value) if (raw.id !== set.id && !candidates.has(raw.id)) candidates.set(raw.id, raw);
    }
    if (candidates.size === 0 && pools.every((p) => p.status === "rejected")) throw new Error("search failed");

    const ranked: SimilarMap[] = [];
    for (const raw of candidates.values()) {
      const result = scoreSimilarity(base, toInput(raw), focus);
      if (!result || result.score < (focus === "sound" ? MIN_SCORE_SOUND : MIN_SCORE)) continue;
      ranked.push({ ...toBeatmapset(raw), score: result.score, reasons: result.reasons, breakdown: result.breakdown });
    }
    return ranked.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  });
}
