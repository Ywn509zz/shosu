import { cached } from "./cache.server";
import type { MusicDna, SimilarMap } from "./insights";
import { getListItems } from "./lists.server";
import { toBeatmapset, getBeatmapset, osuGet, type RawBeatmapset } from "./osu.server";
import { GENRES, LANGUAGES, usefulTags } from "./similar";

/**
 * Music DNA : l'empreinte musicale d'un joueur.
 *
 * Sources (chacune avec un poids) : favoris osu! (3), favoris shOsu! (3) et « à jouer plus tard » (1,5), beatmaps consultées sur shOsu!
 * (2, envoyées par le navigateur car l'historique est local), beatmaps les plus jouées sur osu! (1 à 3 selon le nombre de parties).
 * On prend les 40 beatmaps les plus pesantes, on lit leurs détails (genre, langue, BPM, tags, artiste) et on agrège ces
 * caractéristiques pondérées en une « signature » (genres, langues, tempo, artistes, tags). Puis on cherche des beatmaps jamais
 * jouées qui collent à cette signature (`matches`).
 */

const MAX_SETS = 40;
const MAX_MATCHES = 12;
const MIN_MATCH_SCORE = 25;

type RawSet = RawBeatmapset & { tags?: string; play_count?: number; genre_id?: number; language_id?: number };
type RawMostPlayed = { count?: number; beatmapset?: { id?: number } };

const FR_GENRE: Record<string, string> = {
  Electronic: "électro",
  Rock: "rock",
  Pop: "pop",
  Anime: "anime",
  "Video Game": "jeux vidéo",
  Metal: "metal",
  "Hip Hop": "hip-hop",
  Classical: "classique",
  Folk: "folk",
  Jazz: "jazz",
  Other: "éclectique",
  Novelty: "fantaisie",
};
const FR_LANGUAGE: Record<string, string> = {
  Japanese: "japonais",
  English: "anglais",
  Instrumental: "instrumental",
  Korean: "coréen",
  Chinese: "chinois",
  French: "français",
  German: "allemand",
  Spanish: "espagnol",
  Italian: "italien",
  Russian: "russe",
};

const tempoOf = (bpm: number | null) =>
  bpm === null ? "inconnu" : bpm < 120 ? "lent" : bpm < 160 ? "médium" : bpm < 200 ? "rapide" : "très rapide";

const binOf = (bpm: number) => Math.min(240, Math.max(80, Math.floor(bpm / 20) * 20));
const norm = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

async function safe<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch {
    return fallback;
  }
}

/** Exécute `task` sur chaque élément, `limit` à la fois. */
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

function share(map: Map<string, number>, top = 5) {
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, weight]) => ({ name, share: Math.round((weight / total) * 100) / 100 }))
    .filter((entry) => entry.share >= 0.03);
}

function searchRaw(q: string): Promise<RawSet[]> {
  return cached(`dna-search:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const data = await osuGet<{ beatmapsets?: RawSet[] }>("/beatmapsets/search", { q });
    return data.beatmapsets ?? [];
  });
}

export function getMusicDna(osuId: number, viewed: number[]): Promise<MusicDna | null> {
  const viewedIds = [...new Set(viewed.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20);
  return cached(`dna:${osuId}:${viewedIds.join(",")}`, 15 * 60_000, async () => {
    const weights = new Map<number, number>();
    const bump = (id: number | undefined, weight: number) => {
      if (id && Number.isInteger(id)) weights.set(id, (weights.get(id) ?? 0) + weight);
    };

    const [favourites, mostPlayed, shosuFavourites, shosuLater] = await Promise.all([
      safe(osuGet<RawSet[]>(`/users/${osuId}/beatmapsets/favourite`, { limit: "50" }), []),
      safe(osuGet<RawMostPlayed[]>(`/users/${osuId}/beatmapsets/most_played`, { limit: "50" }), []),
      safe(getListItems(osuId, "favorites"), []),
      safe(getListItems(osuId, "later"), []),
    ]);
    for (const f of favourites) bump(f.id, 3);
    for (const m of mostPlayed) bump(m.beatmapset?.id, Math.min(3, 1 + Math.log10(Math.max(1, m.count ?? 1))));
    for (const l of shosuFavourites) bump(l.id, 3);
    for (const l of shosuLater) bump(l.id, 1.5);
    for (const id of viewedIds) bump(id, 2);
    if (weights.size === 0) return null;

    const known = new Set(weights.keys());
    const top = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SETS);
    const details = (await pool(top, 8, ([id]) => safe(getBeatmapset(id), null))).map((detail, i) => ({
      detail,
      weight: top[i][1],
    }));

    const genres = new Map<string, number>();
    const languages = new Map<string, number>();
    const artists = new Map<string, { name: string; weight: number }>();
    const tags = new Map<string, number>();
    const bins = new Map<number, number>();
    let bpmSum = 0;
    let bpmWeight = 0;
    let lengthSum = 0;
    let lengthWeight = 0;
    let used = 0;

    for (const { detail, weight } of details) {
      if (!detail) continue;
      used++;
      if (detail.genre && detail.genre !== "Unspecified" && detail.genre !== "Any")
        genres.set(detail.genre, (genres.get(detail.genre) ?? 0) + weight);
      if (detail.language && detail.language !== "Unspecified" && detail.language !== "Any") {
        languages.set(detail.language, (languages.get(detail.language) ?? 0) + weight);
      }
      const key = norm(detail.artist);
      if (key) artists.set(key, { name: detail.artist.slice(0, 60), weight: (artists.get(key)?.weight ?? 0) + weight });
      for (const tag of usefulTags(detail.tags, detail.artist)) tags.set(tag, (tags.get(tag) ?? 0) + weight);
      if (detail.bpm && detail.bpm > 0) {
        bins.set(binOf(detail.bpm), (bins.get(binOf(detail.bpm)) ?? 0) + weight);
        bpmSum += detail.bpm * weight;
        bpmWeight += weight;
      }
      if (detail.lengthSeconds) {
        lengthSum += detail.lengthSeconds * weight;
        lengthWeight += weight;
      }
    }
    if (used === 0) return null;

    const averageBpm = bpmWeight ? Math.round(bpmSum / bpmWeight) : null;
    const topArtists = [...artists.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((a) => a.name);
    const topTags = [...tags.entries()]
      .filter(([, w]) => w >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
    const genreShares = share(genres);
    const languageShares = share(languages);
    const histogram = [80, 100, 120, 140, 160, 180, 200, 220, 240].map((bin) => ({
      label: String(bin),
      value: Math.round((bins.get(bin) ?? 0) * 10) / 10,
    }));

    const parts: string[] = [];
    if (genreShares[0]) parts.push(FR_GENRE[genreShares[0].name] ?? genreShares[0].name.toLowerCase());
    if (genreShares[1] && genreShares[1].share >= 0.2)
      parts[0] = `${parts[0]} et ${FR_GENRE[genreShares[1].name] ?? genreShares[1].name.toLowerCase()}`;
    const signature = [
      `${parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Musique variée"} ${tempoOf(averageBpm) !== "inconnu" ? tempoOf(averageBpm) : ""}`.trim() +
        (averageBpm ? ` (≈ ${averageBpm} BPM)` : ""),
      languageShares[0] ? `surtout ${FR_LANGUAGE[languageShares[0].name] ?? languageShares[0].name.toLowerCase()}` : "",
      topArtists.length ? `avec ${topArtists.slice(0, 3).join(", ")}` : "",
      topTags.length ? `ambiance ${topTags.slice(0, 3).join(" · ")}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    // --- Beatmaps qui collent à l'empreinte ---------------------------------
    const queries = [...topArtists.slice(0, 2), ...topTags.slice(0, 3), genreShares[0]?.name ?? ""].filter(
      (q) => q.length >= 2,
    );
    const pools = await Promise.all(queries.map((q) => safe(searchRaw(q), [])));
    const maxGenre = genreShares[0]?.share || 1;
    const maxLanguage = languageShares[0]?.share || 1;
    const maxBin = Math.max(...histogram.map((h) => h.value), 1);
    const wantedTags = new Set(topTags);
    const artistKeys = new Set(topArtists.map(norm));

    const seen = new Set<number>();
    const scored: { set: SimilarMap; artist: string }[] = [];
    for (const list of pools) {
      for (const raw of list) {
        if (seen.has(raw.id) || known.has(raw.id)) continue;
        seen.add(raw.id);
        const reasons: string[] = [];
        let score = 0;

        const genre = GENRES[raw.genre_id ?? 0];
        const g = genreShares.find((s) => s.name === genre);
        if (g) {
          score += Math.round(22 * (g.share / maxGenre));
          reasons.push(`Genre ${genre} (${Math.round(g.share * 100)} % de ton ADN)`);
        }
        const language = LANGUAGES[raw.language_id ?? 0];
        const l = languageShares.find((s) => s.name === language);
        if (l) score += Math.round(10 * (l.share / maxLanguage));

        if (typeof raw.bpm === "number" && raw.bpm > 0) {
          const fit = (bins.get(binOf(raw.bpm)) ?? 0) / maxBin;
          if (fit > 0) {
            score += Math.round(22 * fit);
            if (fit >= 0.5) reasons.push(`Tempo de ton ADN (≈ ${Math.round(raw.bpm)} BPM)`);
          }
        }
        const mine = usefulTags(
          String(raw.tags ?? "")
            .split(/\s+/)
            .filter(Boolean),
          raw.artist,
        ).filter((t) => wantedTags.has(t));
        if (mine.length > 0) {
          score += Math.min(28, mine.length * 10);
          reasons.push(`Ambiance : ${mine.slice(0, 3).join(", ")}`);
        }
        if (artistKeys.has(norm(raw.artist))) {
          score += 14;
          reasons.push(`Un artiste de ton ADN : ${raw.artist}`);
        }
        if (typeof raw.play_count === "number" && raw.play_count > 0)
          score += Math.min(4, Math.log10(raw.play_count) / 1.5);
        if (score < MIN_MATCH_SCORE) continue;
        scored.push({
          set: { ...toBeatmapset(raw), score: Math.min(100, Math.round(score)), reasons: reasons.slice(0, 3) },
          artist: norm(raw.artist),
        });
      }
    }
    scored.sort((a, b) => b.set.score - a.set.score);
    const perArtist = new Map<string, number>();
    const matches: SimilarMap[] = [];
    for (const entry of scored) {
      const n = perArtist.get(entry.artist) ?? 0;
      if (n >= 2) continue;
      perArtist.set(entry.artist, n + 1);
      matches.push(entry.set);
      if (matches.length >= MAX_MATCHES) break;
    }

    return {
      sample: {
        sets: used,
        osuFavourites: favourites.length,
        mostPlayed: mostPlayed.length,
        shosuLists: shosuFavourites.length + shosuLater.length,
        viewed: viewedIds.length,
      },
      signature,
      genres: genreShares,
      languages: languageShares,
      bpm: { average: averageBpm, tempo: tempoOf(averageBpm), histogram },
      artists: topArtists,
      tags: topTags,
      averageLengthSeconds: lengthWeight ? Math.round(lengthSum / lengthWeight) : null,
      matches,
    };
  });
}
