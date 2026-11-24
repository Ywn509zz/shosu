/**
 * Comparaison de deux beatmaps (sets) : fonction pure, partagée par la page /compare et l'outil `compare_beatmaps` de Stack.
 * Compare la métadonnée (BPM, durée, popularité, genre…) et la plus dure difficulté de chaque set, calcule leur ressemblance
 * (globale et « musique seulement ») et résume en phrases.
 */
import { formatDuration, type BeatmapDifficulty, type BeatmapsetDetail } from "./osu";
import { scoreSimilarity, type SimilarityInput } from "./similar";

export type CompareRow = {
  label: string;
  a: string;
  b: string;
  /** Côté qui a la valeur la plus haute (pour la mettre en avant) ; null si égalité ou non numérique. */
  higher: "a" | "b" | null;
};

export type Comparison = {
  rows: CompareRow[];
  similarity: { mix: number; sound: number; reasons: string[] };
  verdict: string[];
};

const dash = "—";
const fmt = (v: number | null, digits = 0) =>
  v === null ? dash : v.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function toSimilarityInput(set: BeatmapsetDetail): SimilarityInput {
  return {
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
}

function hardest(set: BeatmapsetDetail): BeatmapDifficulty | null {
  return set.difficulties.length ? set.difficulties.reduce((a, b) => (b.stars > a.stars ? b : a)) : null;
}

export function compareSets(a: BeatmapsetDetail, b: BeatmapsetDetail): Comparison {
  const ha = hardest(a);
  const hb = hardest(b);

  const num = (
    label: string,
    va: number | null,
    vb: number | null,
    format: (v: number | null) => string = (v) => fmt(v),
  ): CompareRow => ({
    label,
    a: format(va),
    b: format(vb),
    higher: va === null || vb === null || va === vb ? null : va > vb ? "a" : "b",
  });
  const text = (label: string, va: string | null, vb: string | null): CompareRow => ({
    label,
    a: va || dash,
    b: vb || dash,
    higher: null,
  });

  const rows: CompareRow[] = [
    num("Difficulté max", a.maxStars, b.maxStars, (v) => (v === null ? dash : `${v.toFixed(2)}★`)),
    num("Difficulté min", a.minStars, b.minStars, (v) => (v === null ? dash : `${v.toFixed(2)}★`)),
    num("Nombre de difficultés", a.difficulties.length, b.difficulties.length),
    num("BPM", a.bpm, b.bpm),
    num("Durée", a.lengthSeconds, b.lengthSeconds, (v) => formatDuration(v)),
    num("Combo max (plus dure)", ha?.maxCombo ?? null, hb?.maxCombo ?? null),
    num("AR (plus dure)", ha?.ar ?? null, hb?.ar ?? null, (v) => fmt(v, 1)),
    num("OD (plus dure)", ha?.od ?? null, hb?.od ?? null, (v) => fmt(v, 1)),
    num("CS (plus dure)", ha?.cs ?? null, hb?.cs ?? null, (v) => fmt(v, 1)),
    num("HP (plus dure)", ha?.hp ?? null, hb?.hp ?? null, (v) => fmt(v, 1)),
    num("Favoris", a.favouriteCount, b.favouriteCount),
    num("Parties jouées", a.playCount, b.playCount),
    text("Genre", a.genre, b.genre),
    text("Langue", a.language, b.language),
    text("Statut", a.status, b.status),
    text("Mappeur", a.creator, b.creator),
  ];

  const mix = scoreSimilarity(toSimilarityInput(a), toSimilarityInput(b), "mix");
  const sound = scoreSimilarity(toSimilarityInput(a), toSimilarityInput(b), "sound");

  const verdict: string[] = [];
  const A = `« ${a.title} »`;
  const B = `« ${b.title} »`;
  if (a.maxStars !== null && b.maxStars !== null) {
    const gap = a.maxStars - b.maxStars;
    verdict.push(
      Math.abs(gap) < 0.2
        ? `Difficulté comparable (${a.maxStars.toFixed(1)}★ et ${b.maxStars.toFixed(1)}★ pour la plus dure).`
        : `${gap > 0 ? A : B} est plus difficile : ${Math.max(a.maxStars, b.maxStars).toFixed(1)}★ contre ${Math.min(a.maxStars, b.maxStars).toFixed(1)}★ (${Math.abs(gap).toFixed(1)}★ d'écart).`,
    );
  }
  if (a.bpm !== null && b.bpm !== null) {
    const gap = a.bpm - b.bpm;
    verdict.push(
      Math.abs(gap) < 10
        ? `BPM comparable (${Math.round(a.bpm)} et ${Math.round(b.bpm)}).`
        : `${gap > 0 ? A : B} est plus rapide : ${Math.round(Math.max(a.bpm, b.bpm))} BPM contre ${Math.round(Math.min(a.bpm, b.bpm))}.`,
    );
  }
  if (a.lengthSeconds !== null && b.lengthSeconds !== null) {
    const gap = a.lengthSeconds - b.lengthSeconds;
    verdict.push(
      Math.abs(gap) < 15
        ? "Durées voisines."
        : `${gap > 0 ? A : B} est plus longue de ${formatDuration(Math.abs(gap))} (${formatDuration(Math.max(a.lengthSeconds, b.lengthSeconds))} contre ${formatDuration(Math.min(a.lengthSeconds, b.lengthSeconds))}).`,
    );
  }
  if (a.playCount && b.playCount) {
    const ratio = Math.max(a.playCount, b.playCount) / Math.min(a.playCount, b.playCount);
    if (ratio >= 1.5)
      verdict.push(
        `${a.playCount > b.playCount ? A : B} est ${ratio >= 10 ? "bien" : ""} plus jouée (${ratio.toFixed(1)} fois plus de parties).`.replace(
          "est  plus",
          "est plus",
        ),
      );
  }
  verdict.push(
    sound
      ? `Ressemblance musicale : ${sound.score} %${sound.reasons.length ? ` (${sound.reasons.join(", ").toLowerCase()})` : ""}.`
      : "Peu de points communs musicaux (artiste, tags, BPM, genre).",
  );

  return {
    rows,
    similarity: { mix: mix?.score ?? 0, sound: sound?.score ?? 0, reasons: (sound ?? mix)?.reasons ?? [] },
    verdict,
  };
}
