import { cached } from "./cache.server";
import type { TasteSample } from "./insights";
import { getListItems } from "./lists.server";
import { getBeatmapset } from "./osu.server";
import {
  getBestScores,
  getFavourites,
  getMainMode,
  getMostPlayed,
  getRecentScores,
  type RawScore,
} from "./player-data.server";
import { usefulTags } from "./similar";

/**
 * MODÈLE DU JOUEUR — la source unique de ce qu'on sait de lui, utilisée par les recommandations, le Music DNA, l'analyse des
 * performances (profil) et Stack. Il est calculé UNE fois (cache 15 min) à partir des sources partagées (`player-data.server.ts`) :
 *
 *   • `skill` (compétence) : tiré de ses 100 meilleurs scores — zone de difficulté (quartiles), tempo médian, durée, mods ;
 *   • `taste` (goûts) : tiré de tout ce qu'il aime, joue et consulte, pondéré — genres, langues, tempo (histogramme), artistes, tags.
 *
 * Poids des sources : favoris osu! 3 · favoris shOsu! 3 · « à jouer plus tard » 1,5 · consultées 2 · les plus jouées 1 à 3 ·
 * meilleurs scores 1. Les 40 beatmaps les plus lourdes sont lues en détail (genre, langue, tags, BPM) ; les artistes, eux, sont
 * comptés sur TOUTES les sources.
 */

export type Skill = {
  plays: number;
  stars: { median: number; low: number; high: number; mean: number };
  bpmMedian: number | null;
  lengthSeconds: number | null;
  mods: { mod: string; share: number }[];
};

export type Taste = {
  genres: { name: string; share: number }[];
  languages: { name: string; share: number }[];
  bpm: { average: number | null; tempo: string; histogram: { label: string; value: number }[] };
  artists: string[];
  tags: string[];
  averageLengthSeconds: number | null;
  /** Résumé en une phrase (« Rock et pop rapide (≈ 174 BPM), surtout anglais… »). */
  signature: string;
};

export type PlayerModel = {
  mode: string;
  skill: Skill | null;
  taste: Taste | null;
  sample: TasteSample;
  /** Tout ce que le joueur connaît déjà (jamais recommandé). Côté serveur uniquement. */
  known: Set<number>;
};

// ---------------------------------------------------------------------------
// Fonctions pures (testées dans tests/model.test.ts)
// ---------------------------------------------------------------------------

const IGNORED_MODS = new Set(["NF", "SD", "PF"]);
const modName = (m: string | { acronym: string }) => (typeof m === "string" ? m : m.acronym);
const round1 = (v: number) => Math.round(v * 10) / 10;
const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Compétence d'après les meilleurs scores ; `null` sans score. */
export function deriveSkill(best: RawScore[]): Skill | null {
  const scored = best.filter((s) => s.beatmap && typeof s.beatmap.difficulty_rating === "number");
  if (scored.length === 0) return null;

  const stars = scored.map((s) => s.beatmap!.difficulty_rating).sort((a, b) => a - b);
  const bpms = scored.map((s) => s.beatmap!.bpm).filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const lengths = scored.map((s) => s.beatmap!.total_length).filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);

  const count = new Map<string, number>();
  for (const s of scored) {
    for (const mod of s.mods ?? []) {
      const name = modName(mod);
      if (name && !IGNORED_MODS.has(name)) count.set(name, (count.get(name) ?? 0) + 1);
    }
  }
  const mods = [...count.entries()]
    .map(([mod, n]) => ({ mod, share: Math.round((n / scored.length) * 100) / 100 }))
    .filter((m) => m.share >= 0.1)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);

  return {
    plays: scored.length,
    stars: {
      median: round1(stars[Math.floor(stars.length / 2)]),
      low: round1(quantile(stars, 0.25)),
      high: round1(quantile(stars, 0.75)),
      mean: round1(stars.reduce((a, b) => a + b, 0) / stars.length),
    },
    bpmMedian: bpms.length ? Math.round(bpms[Math.floor(bpms.length / 2)]) : null,
    lengthSeconds: lengths.length ? Math.round(lengths[Math.floor(lengths.length / 2)]) : null,
    mods,
  };
}

export type TasteEntry = { id: number; weight: number; artist?: string };
export type TasteDetail = {
  genre: string | null;
  language: string | null;
  bpm: number | null;
  artist: string;
  tags: string[];
  lengthSeconds: number | null;
};

const FR_GENRE: Record<string, string> = {
  Electronic: "électro", Rock: "rock", Pop: "pop", Anime: "anime", "Video Game": "jeux vidéo", Metal: "metal",
  "Hip Hop": "hip-hop", Classical: "classique", Folk: "folk", Jazz: "jazz", Other: "éclectique", Novelty: "fantaisie",
};
const FR_LANGUAGE: Record<string, string> = {
  Japanese: "japonais", English: "anglais", Instrumental: "instrumental", Korean: "coréen", Chinese: "chinois",
  French: "français", German: "allemand", Spanish: "espagnol", Italian: "italien", Russian: "russe",
};

export const tempoOf = (bpm: number | null) =>
  bpm === null ? "inconnu" : bpm < 120 ? "lent" : bpm < 160 ? "médium" : bpm < 200 ? "rapide" : "très rapide";
export const bpmBin = (bpm: number) => Math.min(240, Math.max(80, Math.floor(bpm / 20) * 20));
export const BPM_BINS = [80, 100, 120, 140, 160, 180, 200, 220, 240];

function shares(map: Map<string, number>, top = 5) {
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, weight]) => ({ name, share: Math.round((weight / total) * 100) / 100 }))
    .filter((e) => e.share >= 0.03);
}

/**
 * Goûts d'après des beatmaps pondérées. `entries` : TOUTES les sources (poids, artiste brut) ; `details` : détails des plus lourdes.
 * Renvoie `null` sans aucune donnée exploitable.
 */
export function buildTaste(entries: TasteEntry[], details: Map<number, TasteDetail | null>): Taste | null {
  const genres = new Map<string, number>();
  const languages = new Map<string, number>();
  const tags = new Map<string, number>();
  const artists = new Map<string, { name: string; weight: number }>();
  const bins = new Map<number, number>();
  let bpmSum = 0;
  let bpmWeight = 0;
  let lengthSum = 0;
  let lengthWeight = 0;
  let detailed = 0;

  const addArtist = (name: string | undefined, weight: number) => {
    const key = norm(name ?? "");
    if (key.length < 2) return;
    const current = artists.get(key) ?? { name: String(name).slice(0, 60), weight: 0 };
    current.weight += weight;
    artists.set(key, current);
  };

  for (const entry of entries) {
    const detail = details.get(entry.id) ?? null;
    addArtist(entry.artist ?? detail?.artist, entry.weight);
    if (!detail) continue;
    detailed++;
    const w = entry.weight;
    if (detail.genre && detail.genre !== "Unspecified" && detail.genre !== "Any") genres.set(detail.genre, (genres.get(detail.genre) ?? 0) + w);
    if (detail.language && detail.language !== "Unspecified" && detail.language !== "Any") languages.set(detail.language, (languages.get(detail.language) ?? 0) + w);
    for (const tag of usefulTags(detail.tags, detail.artist)) tags.set(tag, (tags.get(tag) ?? 0) + w);
    if (detail.bpm && detail.bpm > 0) {
      bins.set(bpmBin(detail.bpm), (bins.get(bpmBin(detail.bpm)) ?? 0) + w);
      bpmSum += detail.bpm * w;
      bpmWeight += w;
    }
    if (detail.lengthSeconds) {
      lengthSum += detail.lengthSeconds * w;
      lengthWeight += w;
    }
  }
  if (detailed === 0 && artists.size === 0) return null;

  const average = bpmWeight ? Math.round(bpmSum / bpmWeight) : null;
  const topArtists = [...artists.values()].sort((a, b) => b.weight - a.weight).slice(0, 6).map((a) => a.name);
  const topTags = [...tags.entries()].filter(([, w]) => w >= 4).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  const genreShares = shares(genres);
  const languageShares = shares(languages);

  const first = genreShares[0] ? (FR_GENRE[genreShares[0].name] ?? genreShares[0].name.toLowerCase()) : "";
  const second = genreShares[1] && genreShares[1].share >= 0.2 ? (FR_GENRE[genreShares[1].name] ?? genreShares[1].name.toLowerCase()) : "";
  const genreText = first ? first.charAt(0).toUpperCase() + first.slice(1) + (second ? ` et ${second}` : "") : "Musique variée";
  const tempo = tempoOf(average);
  const signature = [
    `${genreText}${tempo !== "inconnu" ? ` ${tempo}` : ""}${average ? ` (≈ ${average} BPM)` : ""}`,
    languageShares[0] ? `surtout ${FR_LANGUAGE[languageShares[0].name] ?? languageShares[0].name.toLowerCase()}` : "",
    topArtists.length ? `avec ${topArtists.slice(0, 3).join(", ")}` : "",
    topTags.length ? `ambiance ${topTags.slice(0, 3).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    genres: genreShares,
    languages: languageShares,
    bpm: { average, tempo, histogram: BPM_BINS.map((bin) => ({ label: String(bin), value: Math.round((bins.get(bin) ?? 0) * 10) / 10 })) },
    artists: topArtists,
    tags: topTags,
    averageLengthSeconds: lengthWeight ? Math.round(lengthSum / lengthWeight) : null,
    signature,
  };
}

// ---------------------------------------------------------------------------
// Construction du modèle (réseau + Redis)
// ---------------------------------------------------------------------------

const MAX_DETAILED = 40;

async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

const orEmpty = <T,>(task: Promise<T[]>) => task.catch(() => [] as T[]);

/**
 * Le modèle d'un joueur. `viewed` : identifiants de beatmaps consultées récemment (l'historique est local au navigateur, donc fourni
 * par lui, 20 au plus). Même `viewed` → même modèle (cache 15 min), donc mêmes chiffres partout.
 */
export function getPlayerModel(osuId: number, requestedMode: string | undefined, viewed: number[]): Promise<PlayerModel> {
  const viewedIds = [...new Set(viewed.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20);
  return cached(`model:${osuId}:${requestedMode ?? "main"}:${viewedIds.join(",")}`, 15 * 60_000, async () => {
    const mode = requestedMode ?? (await getMainMode(osuId));
    const [best, recent, favourites, mostPlayed, shosuFavourites, shosuLater] = await Promise.all([
      orEmpty(getBestScores(osuId, mode)),
      orEmpty(getRecentScores(osuId, mode)),
      orEmpty(getFavourites(osuId)),
      orEmpty(getMostPlayed(osuId)),
      orEmpty(getListItems(osuId, "favorites")),
      orEmpty(getListItems(osuId, "later")),
    ]);

    const entries = new Map<number, TasteEntry>();
    const known = new Set<number>();
    const add = (id: number | undefined, weight: number, artist?: string) => {
      if (!id || !Number.isInteger(id)) return;
      known.add(id);
      const current = entries.get(id);
      if (current) {
        current.weight += weight;
        current.artist ??= artist;
      } else entries.set(id, { id, weight, artist });
    };
    for (const f of favourites) add(f.id, 3, f.artist);
    for (const m of mostPlayed) add(m.beatmapset?.id, Math.min(3, 1 + Math.log10(Math.max(1, m.count ?? 1))), m.beatmapset?.artist);
    for (const l of shosuFavourites) add(l.id, 3, l.artist);
    for (const l of shosuLater) add(l.id, 1.5, l.artist);
    for (const id of viewedIds) add(id, 2);
    for (const s of best) add(s.beatmapset?.id ?? s.beatmap?.beatmapset_id, 1, s.beatmapset?.artist);
    for (const s of recent) add(s.beatmapset?.id ?? s.beatmap?.beatmapset_id, 0, s.beatmapset?.artist); // connue, sans influence sur les goûts

    const heaviest = [...entries.values()].filter((e) => e.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, MAX_DETAILED);
    const details = new Map<number, TasteDetail | null>();
    await pool(heaviest, 8, async (entry) => {
      try {
        const d = await getBeatmapset(entry.id);
        details.set(entry.id, { genre: d.genre, language: d.language, bpm: d.bpm, artist: d.artist, tags: d.tags, lengthSeconds: d.lengthSeconds });
      } catch {
        details.set(entry.id, null);
      }
    });

    const taste = buildTaste([...entries.values()].filter((e) => e.weight > 0), details);
    return {
      mode,
      skill: deriveSkill(best),
      taste,
      sample: {
        sets: [...details.values()].filter(Boolean).length,
        osuFavourites: favourites.length,
        mostPlayed: mostPlayed.length,
        shosuLists: shosuFavourites.length + shosuLater.length,
        viewed: viewedIds.length,
        bestScores: best.length,
      },
      known,
    };
  });
}
