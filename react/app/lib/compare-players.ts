/**
 * Comparaison de deux joueurs : fonction pure, partagée par la page /compare/players et l'outil `compare_players` de Stack.
 * Compare les statistiques du mode choisi, le style de jeu (difficulté, BPM, mods des meilleurs scores), les modes préférés
 * et les beatmaps que les deux joueurs ont dans leurs meilleurs scores.
 */
import type { ModeSummary } from "./insights";
import { formatNumber, type PlayerPage, type TopPlay } from "./osu";

export type PlayerRow = {
  label: string;
  a: string;
  b: string;
  /** Côté qui a la meilleure valeur (rang : le plus petit ; autres : le plus grand) ; null si égalité ou inconnu. */
  better: "a" | "b" | null;
};

export type CommonPlay = {
  beatmapsetId: number;
  title: string;
  artist: string;
  a: { pp: number | null; accuracy: number | null; mods: string[] };
  b: { pp: number | null; accuracy: number | null; mods: string[] };
};

export type PlayerComparison = {
  rows: PlayerRow[];
  verdict: string[];
  common: CommonPlay[];
};

const MODE_LABELS: Record<string, string> = { osu: "Standard", taiko: "Taiko", fruits: "fruits", mania: "Mania" };
const dash = "—";
const mean = (values: number[]) => (values.length ? values.reduce((x, y) => x + y, 0) / values.length : null);

/** Style de jeu d'après les meilleurs scores. */
export function playStyle(plays: TopPlay[]) {
  return {
    stars: mean(plays.map((p) => p.stars)),
    bpm: mean(plays.map((p) => p.bpm).filter((v): v is number => v !== null)),
    pp: mean(plays.map((p) => p.pp).filter((v): v is number => v !== null)),
    dtShare: plays.length
      ? plays.filter((p) => p.mods.includes("DT") || p.mods.includes("NC")).length / plays.length
      : null,
  };
}

const favouriteMode = (modes?: ModeSummary[]) => {
  const played = (modes ?? []).filter((m) => m.played && m.plays > 0).sort((x, y) => y.plays - x.plays);
  return played[0] ? { mode: played[0].mode, share: played[0].plays / played.reduce((s, m) => s + m.plays, 0) } : null;
};

export function comparePlayers(
  a: PlayerPage,
  b: PlayerPage,
  modesA?: ModeSummary[],
  modesB?: ModeSummary[],
): PlayerComparison {
  const styleA = playStyle(a.topPlays);
  const styleB = playStyle(b.topPlays);

  const higher = (va: number | null, vb: number | null): PlayerRow["better"] =>
    va === null || vb === null || va === vb ? null : va > vb ? "a" : "b";
  const lower = (va: number | null, vb: number | null): PlayerRow["better"] =>
    va === null || vb === null || va === vb ? null : va < vb ? "a" : "b";
  const num = (
    label: string,
    va: number | null,
    vb: number | null,
    format: (v: number | null) => string,
    better = higher,
  ): PlayerRow => ({
    label,
    a: format(va),
    b: format(vb),
    better: better(va, vb),
  });
  const n0 = (v: number | null) => (v === null ? dash : formatNumber(v));
  const rank = (v: number | null) => (v === null ? "Non classé" : `#${formatNumber(v)}`);
  const pct = (v: number | null) => (v === null ? dash : `${v.toFixed(2)} %`);

  const rows: PlayerRow[] = [
    num("Rang mondial", a.globalRank, b.globalRank, rank, lower),
    num(
      `Rang ${a.country && a.country === b.country ? a.country : "national"}`,
      a.countryRank,
      b.countryRank,
      rank,
      lower,
    ),
    num("Performance (pp)", a.pp, b.pp, (v) => (v === null ? dash : `${formatNumber(v)} pp`)),
    num("Précision", a.accuracy, b.accuracy, pct),
    num("Parties jouées", a.playCount, b.playCount, n0),
    num("Temps de jeu (h)", a.playTimeHours, b.playTimeHours, n0),
    num("Niveau", a.level, b.level, n0),
    num("Combo max", a.maxCombo, b.maxCombo, n0),
    num("Grades SS", a.grades.ss, b.grades.ss, n0),
    num("Grades S", a.grades.s, b.grades.s, n0),
    num("Difficulté moyenne des meilleurs scores", styleA.stars, styleB.stars, (v) =>
      v === null ? dash : `${v.toFixed(2)}★`,
    ),
    num("BPM moyen des meilleurs scores", styleA.bpm, styleB.bpm, (v) => (v === null ? dash : String(Math.round(v)))),
    num(
      "Part de scores en DT/NC",
      styleA.dtShare,
      styleB.dtShare,
      (v) => (v === null ? dash : `${Math.round(v * 100)} %`),
      () => null,
    ),
  ];

  // --- Beatmaps en commun dans les meilleurs scores ---
  const byId = new Map(b.topPlays.map((p) => [p.beatmapsetId, p]));
  const common: CommonPlay[] = [];
  for (const pa of a.topPlays) {
    const pb = byId.get(pa.beatmapsetId);
    if (pb) {
      common.push({
        beatmapsetId: pa.beatmapsetId,
        title: pa.title,
        artist: pa.artist,
        a: { pp: pa.pp, accuracy: pa.accuracy, mods: pa.mods },
        b: { pp: pb.pp, accuracy: pb.accuracy, mods: pb.mods },
      });
    }
  }

  // --- Résumé en phrases ---
  const verdict: string[] = [];
  const A = a.username;
  const B = b.username;
  if (a.pp !== null && b.pp !== null && a.pp !== b.pp) {
    const diff = Math.abs(a.pp - b.pp);
    const ratio = Math.max(a.pp, b.pp) / Math.max(1, Math.min(a.pp, b.pp));
    verdict.push(
      `${a.pp > b.pp ? A : B} a ${formatNumber(diff)} pp de plus (${ratio >= 1.1 ? `${ratio.toFixed(1)} fois plus` : "écart faible"}).`,
    );
  }
  if (a.globalRank !== null && b.globalRank !== null && a.globalRank !== b.globalRank) {
    verdict.push(
      `${a.globalRank < b.globalRank ? A : B} est mieux classé : #${formatNumber(Math.min(a.globalRank, b.globalRank))} contre #${formatNumber(Math.max(a.globalRank, b.globalRank))}.`,
    );
  }
  if (a.accuracy !== null && b.accuracy !== null && Math.abs(a.accuracy - b.accuracy) >= 0.3) {
    verdict.push(
      `${a.accuracy > b.accuracy ? A : B} est plus précis (${Math.abs(a.accuracy - b.accuracy).toFixed(2)} point d'écart).`,
    );
  }
  if (a.playTimeHours && b.playTimeHours) {
    const ratio = Math.max(a.playTimeHours, b.playTimeHours) / Math.min(a.playTimeHours, b.playTimeHours);
    if (ratio >= 1.3)
      verdict.push(`${a.playTimeHours > b.playTimeHours ? A : B} a joué ${ratio.toFixed(1)} fois plus longtemps.`);
  }
  if (styleA.stars !== null && styleB.stars !== null && Math.abs(styleA.stars - styleB.stars) >= 0.3) {
    verdict.push(
      `${styleA.stars > styleB.stars ? A : B} joue des maps plus difficiles en moyenne (${Math.max(styleA.stars, styleB.stars).toFixed(1)}★ contre ${Math.min(styleA.stars, styleB.stars).toFixed(1)}★).`,
    );
  }
  const fa = favouriteMode(modesA);
  const fb = favouriteMode(modesB);
  if (fa && fb) {
    verdict.push(
      fa.mode === fb.mode
        ? `Les deux jouent surtout en ${MODE_LABELS[fa.mode] ?? fa.mode}.`
        : `${A} joue surtout en ${MODE_LABELS[fa.mode] ?? fa.mode} (${Math.round(fa.share * 100)} %), ${B} en ${MODE_LABELS[fb.mode] ?? fb.mode} (${Math.round(fb.share * 100)} %).`,
    );
  }
  if (common.length > 0)
    verdict.push(`${common.length} beatmap${common.length > 1 ? "s" : ""} en commun dans leurs meilleurs scores.`);
  if (verdict.length === 0) verdict.push("Pas assez de données dans ce mode pour comparer ces deux joueurs.");

  return { rows, verdict, common };
}
