import { cached } from "./cache.server";
import type { PerformanceAnalysis, PerformanceBand, PerformanceFinding } from "./insights";
import { osuGet } from "./osu.server";

/**
 * Analyse des performances d'un joueur et de ses points faibles — calculée ici, pas par un modèle :
 * on lit ses 100 meilleurs scores et ses 100 derniers (échecs compris), on les range par difficulté, BPM et mods,
 * puis des règles simples (seuils expliqués ci-dessous) repèrent forces et faiblesses. Stack n'a plus qu'à les expliquer.
 */

type RawScore = {
  pp?: number | null;
  accuracy?: number;
  passed?: boolean;
  mods?: (string | { acronym: string })[];
  statistics?: { count_miss?: number; miss?: number };
  beatmap?: { difficulty_rating: number; bpm?: number; ar?: number; cs?: number; total_length?: number };
};

type Play = {
  stars: number;
  accuracy: number;
  pp: number | null;
  bpm: number | null;
  ar: number | null;
  cs: number | null;
  length: number | null;
  mods: string[];
  misses: number | null;
  passed: boolean;
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const IGNORED_MODS = new Set(["NF", "SD", "PF", "CL"]);

function toPlay(score: RawScore): Play | null {
  const b = score.beatmap;
  if (!b || typeof b.difficulty_rating !== "number") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    stars: b.difficulty_rating,
    accuracy: typeof score.accuracy === "number" ? score.accuracy * 100 : 0,
    pp: num(score.pp),
    bpm: num(b.bpm),
    ar: num(b.ar),
    cs: num(b.cs),
    length: num(b.total_length),
    mods: (score.mods ?? []).map((m) => (typeof m === "string" ? m : m.acronym)).filter((m) => !IGNORED_MODS.has(m)),
    misses: num(score.statistics?.count_miss ?? score.statistics?.miss),
    passed: score.passed !== false,
  };
}

const STAR_BANDS: [number, number, string][] = [
  [0, 3, "moins de 3★"],
  [3, 4, "3–4★"],
  [4, 5, "4–5★"],
  [5, 6, "5–6★"],
  [6, 7, "6–7★"],
  [7, 99, "7★ et plus"],
];
const BPM_BANDS: [number, number, string][] = [
  [0, 150, "lent (< 150 BPM)"],
  [150, 190, "moyen (150–190 BPM)"],
  [190, 999, "rapide (190 BPM et plus)"],
];

function bands(
  best: Play[],
  recent: Play[],
  defs: [number, number, string][],
  key: (p: Play) => number | null,
): PerformanceBand[] {
  return defs
    .map(([min, max, label]) => {
      const inBand = (p: Play) => {
        const v = key(p);
        return v !== null && v >= min && v < max;
      };
      const mine = best.filter(inBand);
      const tries = recent.filter(inBand);
      return {
        label,
        count: mine.length,
        accuracy: r2(mean(mine.map((p) => p.accuracy))),
        failRate:
          tries.length >= 5 ? Math.round((tries.filter((p) => !p.passed).length / tries.length) * 100) / 100 : null,
      };
    })
    .filter((band) => band.count > 0 || band.failRate !== null);
}

function modGroup(mods: string[]): string {
  if (mods.length === 0) return "Sans mod";
  if (mods.includes("DT") || mods.includes("NC")) return "DT / NC";
  if (mods.includes("HR")) return "HR";
  if (mods.includes("HD")) return "HD";
  return "Autres mods";
}

export function analyzePerformance(playerId: number, mode: string): Promise<PerformanceAnalysis> {
  return cached(`performance:${playerId}:${mode}`, 10 * 60_000, async () => {
    const [bestRaw, recentRaw] = await Promise.all([
      osuGet<RawScore[]>(`/users/${playerId}/scores/best`, { mode, limit: "100" }),
      osuGet<RawScore[]>(`/users/${playerId}/scores/recent`, { mode, limit: "100", include_fails: "1" }).catch(
        () => [] as RawScore[],
      ),
    ]);
    const best = bestRaw.map(toPlay).filter((p): p is Play => p !== null);
    const recent = recentRaw.map(toPlay).filter((p): p is Play => p !== null);

    const overall = mean(best.map((p) => p.accuracy));
    const byStars = bands(best, recent, STAR_BANDS, (p) => p.stars);
    const byBpm = bands(best, recent, BPM_BANDS, (p) => p.bpm);

    const groups = new Map<string, Play[]>();
    for (const p of best) groups.set(modGroup(p.mods), [...(groups.get(modGroup(p.mods)) ?? []), p]);
    const byMods = [...groups.entries()]
      .map(([label, plays]) => ({
        label,
        count: plays.length,
        averagePp: r1(mean(plays.map((p) => p.pp).filter((v): v is number => v !== null))),
        accuracy: r2(mean(plays.map((p) => p.accuracy))),
      }))
      .sort((a, b) => b.count - a.count);

    const medianStars = best.length
      ? [...best.map((p) => p.stars)].sort((a, b) => a - b)[Math.floor(best.length / 2)]
      : null;
    const profile = {
      stars: r2(mean(best.map((p) => p.stars))),
      bpm: r1(mean(best.map((p) => p.bpm).filter((v): v is number => v !== null))),
      ar: r1(mean(best.map((p) => p.ar).filter((v): v is number => v !== null))),
      cs: r1(mean(best.map((p) => p.cs).filter((v): v is number => v !== null))),
      lengthSeconds: Math.round(mean(best.map((p) => p.length).filter((v): v is number => v !== null)) ?? 0) || null,
    };

    const findings: PerformanceFinding[] = [];
    const add = (f: PerformanceFinding) => findings.push(f);

    if (best.length >= 10 && overall !== null) {
      // 1. Précision par tranche de difficulté (tranches d'au moins 4 scores).
      const solid = byStars.filter((b) => b.count >= 4 && b.accuracy !== null);
      for (const band of solid) {
        if (band.accuracy! <= overall - 1.2) {
          add({
            id: `acc-${band.label}`,
            kind: "weakness",
            title: `Précision en baisse à ${band.label}`,
            detail: `${band.accuracy!.toFixed(2)} % de moyenne dans cette tranche, contre ${overall.toFixed(2)} % sur l'ensemble de tes meilleurs scores.`,
            advice:
              "Rejoue des maps de cette difficulté à un BPM plus bas ou avec EZ pour fiabiliser tes déplacements avant de pousser la vitesse.",
          });
        }
      }
      const star = [...solid].sort((a, b) => b.accuracy! - a.accuracy!)[0];
      if (star && star.accuracy! >= overall + 0.8 && solid.length >= 2) {
        add({
          id: `strong-${star.label}`,
          kind: "strength",
          title: `À l'aise à ${star.label}`,
          detail: `${star.accuracy!.toFixed(2)} % de précision moyenne dans cette tranche (${star.count} scores), ton meilleur terrain.`,
        });
      }

      // 2. Échecs récents par tranche (tranches avec au moins 5 parties récentes).
      for (const band of byStars) {
        if (band.failRate !== null && band.failRate >= 0.35) {
          add({
            id: `fail-${band.label}`,
            kind: "weakness",
            title: `Beaucoup d'échecs à ${band.label}`,
            detail: `${Math.round(band.failRate * 100)} % de tes parties récentes dans cette tranche ne sont pas terminées.`,
            advice:
              "Vise des maps un peu en dessous (environ 0,3★ de moins) pour bâtir l'endurance, puis remonte progressivement.",
          });
        }
      }

      // 3. BPM : la tranche la moins précise (au moins 5 scores).
      const bpmSolid = byBpm.filter((b) => b.count >= 5 && b.accuracy !== null);
      const worstBpm = [...bpmSolid].sort((a, b) => a.accuracy! - b.accuracy!)[0];
      if (worstBpm && bpmSolid.length >= 2 && worstBpm.accuracy! <= overall - 1) {
        add({
          id: `bpm-${worstBpm.label}`,
          kind: "weakness",
          title: `Moins précis sur les maps ${worstBpm.label}`,
          detail: `${worstBpm.accuracy!.toFixed(2)} % de moyenne sur ces maps (${worstBpm.count} scores).`,
          advice: worstBpm.label.startsWith("rapide")
            ? "Travaille la vitesse : streams, doubles et jumps rapprochés à difficulté modérée."
            : "Les maps lentes récompensent la précision rythmique : joue-en pour affiner ton timing et tes sliders.",
        });
      }

      // 4. Mods : écart entre jeu sans mod et avec mods.
      const nm = byMods.find((g) => g.label === "Sans mod");
      const dt = byMods.find((g) => g.label === "DT / NC");
      const hd = byMods.find((g) => g.label === "HD");
      if (
        dt &&
        dt.count >= 6 &&
        nm &&
        nm.count >= 6 &&
        dt.averagePp !== null &&
        nm.averagePp !== null &&
        dt.averagePp > nm.averagePp * 1.1
      ) {
        add({
          id: "mod-dt",
          kind: "strength",
          title: "Très fort avec DT",
          detail: `Tes scores DT rapportent ${dt.averagePp} pp en moyenne, contre ${nm.averagePp} pp sans mod.`,
        });
      }
      if (
        nm &&
        nm.count >= 6 &&
        dt &&
        dt.count >= 6 &&
        nm.averagePp !== null &&
        dt.averagePp !== null &&
        nm.averagePp < dt.averagePp * 0.85
      ) {
        add({
          id: "mod-nm",
          kind: "weakness",
          title: "Tes scores sans mod rapportent moins",
          detail: `${nm.averagePp} pp en moyenne sans mod, contre ${dt.averagePp} pp avec DT.`,
          advice: "Joue plus de maps difficiles sans mod pour bâtir ta lecture et ta précision à vitesse normale.",
        });
      }
      if (
        hd &&
        hd.count >= 5 &&
        nm &&
        nm.count >= 5 &&
        hd.accuracy !== null &&
        nm.accuracy !== null &&
        hd.accuracy <= nm.accuracy - 1.5
      ) {
        add({
          id: "mod-hd",
          kind: "weakness",
          title: "Précision plus faible avec HD",
          detail: `${hd.accuracy.toFixed(2)} % avec HD contre ${nm.accuracy.toFixed(2)} % sans mod.`,
          advice: "Mémorise mieux la lecture : rejoue des maps connues avec HD avant de l'employer sur de nouvelles.",
        });
      }

      // 5. Propreté : misses moyens sur les meilleurs scores (mode standard surtout).
      const misses = best.map((p) => p.misses).filter((v): v is number => v !== null);
      if (misses.length >= 20) {
        const avg = mean(misses)!;
        if (avg >= 3) {
          add({
            id: "misses",
            kind: "weakness",
            title: "Pas mal de misses sur tes meilleurs scores",
            detail: `${avg.toFixed(1)} misses en moyenne sur tes ${misses.length} meilleurs scores.`,
            advice:
              "Un score propre vaut souvent plus : ralentis un peu et vise le « full combo » sur des maps de ton niveau.",
          });
        } else if (avg <= 0.6) {
          add({
            id: "clean",
            kind: "strength",
            title: "Jeu très propre",
            detail: `Seulement ${avg.toFixed(1)} miss en moyenne sur tes meilleurs scores.`,
          });
        }
      }

      // 6. Challenge récent : joue-t-il en dessous de son niveau ?
      const passedRecent = recent.filter((p) => p.passed);
      const recentStars = mean(passedRecent.map((p) => p.stars));
      if (recentStars !== null && medianStars !== null && passedRecent.length >= 15 && recentStars < medianStars - 1) {
        add({
          id: "stagnation",
          kind: "weakness",
          title: "Tu joues en dessous de ton niveau récemment",
          detail: `${recentStars.toFixed(1)}★ en moyenne sur tes dernières parties réussies, contre une médiane de ${medianStars.toFixed(1)}★ sur tes meilleurs scores.`,
          advice: "Pour progresser, tente des maps à environ +0,3★ de ta médiane.",
        });
      }
    }

    return {
      mode,
      sample: { best: best.length, recent: recent.length, fails: recent.filter((p) => !p.passed).length },
      profile,
      byStars,
      byBpm,
      byMods,
      findings: findings.slice(0, 8),
    };
  });
}
