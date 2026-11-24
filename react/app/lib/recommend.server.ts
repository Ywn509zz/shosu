import { cached } from "./cache.server";
import type { Recommendations, ScoreLine } from "./insights";
import { getPlayerModel } from "./model.server";
import { API_MODE, type Beatmapset } from "./osu";
import { osuGet, toBeatmapset, type RawBeatmapset } from "./osu.server";
import type { RawBeatmapLite } from "./player-data.server";
import { finalizeScore, line } from "./score";
import { GENRES, usefulTags } from "./similar";

/**
 * Recommandations d'après le modèle partagé du joueur (`model.server.ts`) : sa **compétence** (zone de difficulté) et ses **goûts**
 * (artistes, tags, tempo, genres) — exactement les mêmes données que le Music DNA et l'analyse des performances.
 *
 * Pour chaque candidat (trouvé autour de ses artistes et tags préférés + beatmaps populaires), le score est une somme de critères
 * expliqués un par un (`breakdown`) : difficulté 40, artiste 28, tags 18, BPM 12, genre 10, durée 6, popularité 8. Les critères non
 * applicables (ex. le joueur n'a pas de tags favoris) sont montrés mais ne comptent pas : 100 % = parfait sur tous les critères applicables.
 * Les beatmaps sans difficulté dans sa zone sont écartées ; celles déjà jouées, favorites ou consultées ne sont jamais proposées.
 */

type RawSet = Omit<RawBeatmapset, "beatmaps"> & {
  beatmaps?: RawBeatmapLite[];
  tags?: string;
  play_count?: number;
  genre_id?: number;
};

const MAX_ITEMS = 12;
const MAX_PER_ARTIST = 2;

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function searchRaw(params: Record<string, string>): Promise<RawSet[]> {
  return cached(`reco-search:${JSON.stringify(params)}`, 10 * 60_000, async () => {
    const data = await osuGet<{ beatmapsets?: RawSet[] }>("/beatmapsets/search", params);
    return data.beatmapsets ?? [];
  });
}

export async function getRecommendations(osuId: number, requestedMode?: string, viewed: number[] = []): Promise<Recommendations> {
  const model = await getPlayerModel(osuId, requestedMode, viewed);
  const { mode, skill, taste, sample, known } = model;
  if (!skill) return { mode, habits: null, items: [] };

  const habits = {
    plays: skill.plays,
    stars: { median: skill.stars.median, low: skill.stars.low, high: skill.stars.high },
    bpm: taste?.bpm.average ?? skill.bpmMedian,
    lengthSeconds: taste?.averageLengthSeconds ?? skill.lengthSeconds,
    mods: skill.mods,
    artists: taste?.artists ?? [],
    tags: taste?.tags ?? [],
    genres: taste?.genres ?? [],
    sample,
  };

  return cached(`reco:${osuId}:${mode}:${[...new Set(viewed)].slice(0, 20).join(",")}`, 15 * 60_000, async () => {
    const m = String(API_MODE[mode]);
    const queries: Record<string, string>[] = [
      ...habits.artists.slice(0, 3).map((q) => ({ q, m })),
      ...habits.tags.slice(0, 3).map((q) => ({ q, m })),
      { q: "", m, s: "ranked", sort: "plays_desc" },
    ];
    const pools = await Promise.all(queries.map((params) => searchRaw(params).catch(() => [] as RawSet[])));

    const target = skill.stars.median + 0.3;
    const zoneMin = Math.max(0.5, skill.stars.low - 0.4);
    const zoneMax = skill.stars.high + 0.7;
    const artistRank = new Map(habits.artists.map((a, i) => [norm(a), i]));
    const wantedTags = new Set(habits.tags);
    const maxGenre = habits.genres[0]?.share || 1;

    const scored: { set: Beatmapset; score: number; reasons: string[]; breakdown: ScoreLine[]; artist: string }[] = [];
    const seen = new Set<number>();
    for (const list of pools) {
      for (const raw of list) {
        if (seen.has(raw.id) || known.has(raw.id)) continue;
        seen.add(raw.id);

        const diffs = (raw.beatmaps ?? []).filter((b) => b.mode.toLowerCase() === mode);
        const fitting = diffs.filter((b) => b.difficulty_rating >= zoneMin && b.difficulty_rating <= zoneMax);
        if (fitting.length === 0) continue; // aucune difficulté dans sa zone : écartée

        const reasons: string[] = [];
        const lines: ScoreLine[] = [];

        // Difficulté : la plus proche de la cible (un peu au-dessus de la médiane, pour progresser).
        const best = fitting.reduce((a, b) => (Math.abs(b.difficulty_rating - target) < Math.abs(a.difficulty_rating - target) ? b : a));
        lines.push(
          line(
            "difficulty",
            "Difficulté",
            40,
            Math.max(0, 1 - Math.abs(best.difficulty_rating - target) / 2) * 40,
            `Une difficulté à ${best.difficulty_rating.toFixed(1)}★ ; ta zone est ${skill.stars.low.toFixed(1)}–${skill.stars.high.toFixed(1)}★ (cible ≈ ${target.toFixed(1)}★, un peu au-dessus de ta médiane ${skill.stars.median.toFixed(1)}★)`,
          ),
        );
        reasons.push(`Une difficulté à ${best.difficulty_rating.toFixed(1)}★, dans ta zone (${skill.stars.low.toFixed(1)}–${skill.stars.high.toFixed(1)}★)`);

        // Artiste
        const rank = artistRank.get(norm(raw.artist));
        lines.push(
          line(
            "artist",
            "Artiste",
            28,
            rank === undefined ? 0 : 28 - rank * 4,
            rank === undefined ? `${raw.artist} n'est pas dans tes artistes favoris (${habits.artists.slice(0, 3).join(", ")}…)` : `Artiste n°${rank + 1} de tes goûts : ${raw.artist}`,
            { applicable: habits.artists.length > 0 },
          ),
        );
        if (rank !== undefined) reasons.push(`Artiste que tu joues souvent : ${raw.artist}`);

        // Tags
        const tags = new Set(usefulTags(String(raw.tags ?? "").split(/\s+/).filter(Boolean), raw.artist));
        const sharedTags = [...wantedTags].filter((tag) => tags.has(tag));
        lines.push(
          line(
            "tags",
            "Tags",
            18,
            Math.min(18, sharedTags.length * 9),
            sharedTags.length ? `${sharedTags.length} tag${sharedTags.length > 1 ? "s" : ""} de tes goûts : ${sharedTags.slice(0, 3).join(", ")}` : `Aucun des tags que tu aimes (${[...wantedTags].slice(0, 3).join(", ")}…)`,
            { applicable: wantedTags.size > 0 },
          ),
        );
        if (sharedTags.length) reasons.push(`Tags de tes goûts : ${sharedTags.slice(0, 2).join(", ")}`);

        // Tempo
        let bpmPoints = 0;
        let bpmDetail = "BPM inconnu";
        if (habits.bpm && typeof raw.bpm === "number" && raw.bpm > 0) {
          const gap = Math.abs(raw.bpm - habits.bpm) / habits.bpm;
          if (gap <= 0.25) {
            bpmPoints = 12 * (1 - gap / 0.25);
            bpmDetail = `BPM ${Math.round(raw.bpm)} contre ≈ ${habits.bpm} chez toi (écart de ${Math.round(gap * 100)} %)`;
            if (gap <= 0.1) reasons.push(`Tempo habituel (≈ ${Math.round(raw.bpm)} BPM)`);
          } else {
            bpmDetail = `BPM ${Math.round(raw.bpm)} contre ≈ ${habits.bpm} chez toi : trop éloigné (écart de ${Math.round(gap * 100)} %, tolérance 25 %)`;
          }
        }
        lines.push(line("bpm", "Tempo", 12, bpmPoints, bpmDetail, { applicable: Boolean(habits.bpm) }));

        // Genre (même donnée que le Music DNA)
        const genre = GENRES[raw.genre_id ?? 0];
        const genreShare = habits.genres.find((g) => g.name === genre);
        lines.push(
          line(
            "genre",
            "Genre",
            10,
            genreShare ? 10 * (genreShare.share / maxGenre) : 0,
            genreShare ? `Genre ${genre} : ${Math.round(genreShare.share * 100)} % de tes goûts` : `Genre ${genre ?? "inconnu"} : pas parmi tes genres dominants`,
            { applicable: habits.genres.length > 0 },
          ),
        );

        // Durée
        let lengthPoints = 0;
        let lengthDetail = "Durée inconnue";
        const length = diffs.length ? Math.max(...diffs.map((b) => b.total_length ?? 0)) : 0;
        if (habits.lengthSeconds && length > 0) {
          const gap = Math.abs(length - habits.lengthSeconds) / habits.lengthSeconds;
          lengthPoints = gap <= 0.4 ? 6 * (1 - gap / 0.4) : 0;
          lengthDetail = `Durée ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")} contre ≈ ${Math.floor(habits.lengthSeconds / 60)}:${String(habits.lengthSeconds % 60).padStart(2, "0")} chez toi${gap > 0.4 ? " : trop différente" : ""}`;
        }
        lines.push(line("length", "Durée", 6, lengthPoints, lengthDetail, { applicable: Boolean(habits.lengthSeconds) }));

        // Popularité
        const plays = typeof raw.play_count === "number" ? raw.play_count : 0;
        lines.push(line("popularity", "Popularité", 8, plays > 0 ? Math.min(8, (Math.log10(plays) / 6) * 8) : 0, plays > 0 ? `${plays.toLocaleString("fr-FR")} parties jouées au total` : "Popularité inconnue"));

        const { score } = finalizeScore(lines);
        scored.push({ set: toBeatmapset(raw as RawBeatmapset), score, reasons: reasons.slice(0, 3), breakdown: lines, artist: norm(raw.artist) });
      }
    }

    // Du meilleur au moins bon, en limitant les doublons d'artiste pour garder de la variété.
    scored.sort((a, b) => b.score - a.score);
    const perArtist = new Map<string, number>();
    const items: Recommendations["items"] = [];
    for (const entry of scored) {
      const count = perArtist.get(entry.artist) ?? 0;
      if (count >= MAX_PER_ARTIST) continue;
      perArtist.set(entry.artist, count + 1);
      items.push({ ...entry.set, score: entry.score, reasons: entry.reasons, breakdown: entry.breakdown });
      if (items.length >= MAX_ITEMS) break;
    }
    return { mode, habits, items };
  });
}
