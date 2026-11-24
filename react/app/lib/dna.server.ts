import { cached } from "./cache.server";
import type { MusicDna, ScoreLine, SimilarMap } from "./insights";
import { bpmBin, getPlayerModel } from "./model.server";
import { toBeatmapset, osuGet, type RawBeatmapset } from "./osu.server";
import type { RawFavourite } from "./player-data.server";
import { finalizeScore, line } from "./score";
import { GENRES, LANGUAGES, usefulTags } from "./similar";

/**
 * Music DNA : l'empreinte musicale du joueur. Elle ne calcule plus rien elle-même : les genres, langues, tempo, artistes et tags
 * viennent du **modèle partagé** (`model.server.ts#getPlayerModel`, source unique avec les recommandations et l'analyse des
 * performances). Ce module ajoute seulement la recherche de beatmaps jamais jouées qui collent à cette empreinte (`matches`),
 * chacune avec son score expliqué critère par critère : genre 22, langue 10, tempo 22, tags 28, artiste 14, popularité 4.
 */

const MAX_MATCHES = 12;
const MIN_MATCH_SCORE = 25;

type RawSet = RawFavourite & { genre_id?: number; language_id?: number; bpm?: number };

const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function searchRaw(q: string): Promise<RawSet[]> {
  return cached(`dna-search:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const data = await osuGet<{ beatmapsets?: RawSet[] }>("/beatmapsets/search", { q });
    return data.beatmapsets ?? [];
  });
}

export async function getMusicDna(osuId: number, viewed: number[]): Promise<MusicDna | null> {
  const model = await getPlayerModel(osuId, undefined, viewed);
  const { taste, sample, known } = model;
  if (!taste) return null;

  return cached(`dna:${osuId}:${[...new Set(viewed)].slice(0, 20).join(",")}`, 15 * 60_000, async () => {
    const queries = [...taste.artists.slice(0, 2), ...taste.tags.slice(0, 3), taste.genres[0]?.name ?? ""].filter((q) => q.length >= 2);
    const pools = await Promise.all(queries.map((q) => searchRaw(q).catch(() => [] as RawSet[])));

    const maxGenre = taste.genres[0]?.share || 1;
    const maxLanguage = taste.languages[0]?.share || 1;
    const binValue = new Map(taste.bpm.histogram.map((h) => [Number(h.label), h.value]));
    const maxBin = Math.max(...taste.bpm.histogram.map((h) => h.value), 0);
    const wantedTags = new Set(taste.tags);
    const artistKeys = new Set(taste.artists.map(norm));

    const seen = new Set<number>();
    const scored: { set: SimilarMap; artist: string }[] = [];
    for (const list of pools) {
      for (const raw of list) {
        if (seen.has(raw.id) || known.has(raw.id)) continue;
        seen.add(raw.id);

        const reasons: string[] = [];
        const lines: ScoreLine[] = [];

        const genre = GENRES[raw.genre_id ?? 0];
        const g = taste.genres.find((s) => s.name === genre);
        lines.push(line("genre", "Genre", 22, g ? 22 * (g.share / maxGenre) : 0, g ? `Genre ${genre} : ${Math.round(g.share * 100)} % de ton ADN` : `Genre ${genre ?? "inconnu"} : pas parmi tes genres dominants`, { applicable: taste.genres.length > 0 }));
        if (g) reasons.push(`Genre ${genre} (${Math.round(g.share * 100)} % de ton ADN)`);

        const language = LANGUAGES[raw.language_id ?? 0];
        const l = taste.languages.find((s) => s.name === language);
        lines.push(line("language", "Langue", 10, l ? 10 * (l.share / maxLanguage) : 0, l ? `Langue ${language} : ${Math.round(l.share * 100)} % de ton ADN` : `Langue ${language ?? "inconnue"} : pas parmi tes langues dominantes`, { applicable: taste.languages.length > 0 }));

        let tempoPoints = 0;
        let tempoDetail = "BPM inconnu";
        if (typeof raw.bpm === "number" && raw.bpm > 0 && maxBin > 0) {
          const fit = (binValue.get(bpmBin(raw.bpm)) ?? 0) / maxBin;
          tempoPoints = 22 * fit;
          tempoDetail = fit > 0 ? `BPM ${Math.round(raw.bpm)} : tranche ${bpmBin(raw.bpm)}–${bpmBin(raw.bpm) + 19} à ${Math.round(fit * 100)} % de ta tranche favorite` : `BPM ${Math.round(raw.bpm)} : tranche que tu écoutes peu`;
          if (fit >= 0.5) reasons.push(`Tempo de ton ADN (≈ ${Math.round(raw.bpm)} BPM)`);
        }
        lines.push(line("tempo", "Tempo", 22, tempoPoints, tempoDetail, { applicable: maxBin > 0 }));

        const mine = usefulTags(String(raw.tags ?? "").split(/\s+/).filter(Boolean), raw.artist).filter((t) => wantedTags.has(t));
        lines.push(line("tags", "Ambiance", 28, Math.min(28, mine.length * 10), mine.length ? `${mine.length} tag${mine.length > 1 ? "s" : ""} de ton ADN : ${mine.slice(0, 3).join(", ")}` : `Aucun des tags de ton ADN (${[...wantedTags].slice(0, 3).join(", ")}…)`, { applicable: wantedTags.size > 0 }));
        if (mine.length) reasons.push(`Ambiance : ${mine.slice(0, 3).join(", ")}`);

        const liked = artistKeys.has(norm(raw.artist));
        lines.push(line("artist", "Artiste", 14, liked ? 14 : 0, liked ? `Un artiste de ton ADN : ${raw.artist}` : `${raw.artist} n'est pas dans tes artistes dominants`, { applicable: taste.artists.length > 0 }));
        if (liked) reasons.push(`Un artiste de ton ADN : ${raw.artist}`);

        const plays = typeof raw.play_count === "number" ? raw.play_count : 0;
        lines.push(line("popularity", "Popularité", 4, plays > 0 ? Math.min(4, Math.log10(plays) / 1.5) : 0, plays > 0 ? `${plays.toLocaleString("fr-FR")} parties jouées au total` : "Popularité inconnue"));

        const { score } = finalizeScore(lines);
        if (score < MIN_MATCH_SCORE) continue;
        scored.push({ set: { ...toBeatmapset(raw as RawBeatmapset), score, reasons: reasons.slice(0, 3), breakdown: lines }, artist: norm(raw.artist) });
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
      sample,
      signature: taste.signature,
      genres: taste.genres,
      languages: taste.languages,
      bpm: taste.bpm,
      artists: taste.artists,
      tags: taste.tags,
      averageLengthSeconds: taste.averageLengthSeconds,
      matches,
    };
  });
}
