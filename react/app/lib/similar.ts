/**
 * Ressemblance entre deux beatmaps : fonction pure (testable), utilisée par le serveur
 * pour classer des candidats trouvés dans la recherche osu!.
 */

export type SimilarityInput = {
  id: number;
  artist: string;
  creator: string;
  source: string;
  tags: string[];
  genre: string | null;
  language: string | null;
  bpm: number | null;
  /** Étoiles de la difficulté la plus facile / la plus difficile. */
  minStars: number | null;
  maxStars: number | null;
  modes: string[];
};

/** Mots trop courants pour dire quoi que ce soit d'une beatmap. */
const STOP_TAGS = new Set([
  "the", "a", "an", "of", "and", "feat", "ft", "remix", "ver", "version", "tv", "size", "full", "music", "song",
  "official", "original", "ost", "new", "edit", "cover", "japanese", "english", "instrumental", "pop", "rock",
]);

const norm = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function usefulTags(tags: string[], artist: string): string[] {
  const artistWords = new Set(norm(artist).split(" "));
  return [...new Set(tags.map((t) => norm(t)).filter((t) => t.length >= 3 && !STOP_TAGS.has(t) && !artistWords.has(t)))];
}

const mid = (input: SimilarityInput) =>
  input.minStars !== null && input.maxStars !== null ? (input.minStars + input.maxStars) / 2 : null;

/**
 * Note de 0 à 100 et raisons. Renvoie null si les deux beatmaps n'ont aucun mode en commun
 * (comparer du taiko à du mania n'aurait pas de sens).
 */
export function scoreSimilarity(base: SimilarityInput, other: SimilarityInput): { score: number; reasons: string[] } | null {
  if (base.id === other.id) return null;
  if (!base.modes.some((m) => other.modes.includes(m))) return null;

  const reasons: string[] = [];
  let score = 0;

  if (base.artist && norm(base.artist) === norm(other.artist)) {
    score += 34;
    reasons.push("Même artiste");
  }
  if (base.source && norm(base.source) === norm(other.source)) {
    score += 12;
    reasons.push(`Même source (${other.source})`);
  }

  const a = usefulTags(base.tags, base.artist);
  const b = new Set(usefulTags(other.tags, other.artist));
  const shared = a.filter((tag) => b.has(tag));
  if (a.length > 0 && b.size > 0 && shared.length > 0) {
    const jaccard = shared.length / (a.length + b.size - shared.length);
    score += Math.min(26, Math.round(jaccard * 60));
    reasons.push(`Tags communs : ${shared.slice(0, 3).join(", ")}`);
  }

  if (base.bpm !== null && other.bpm !== null && base.bpm > 0) {
    const gap = Math.abs(base.bpm - other.bpm);
    const ratio = gap / base.bpm;
    if (ratio <= 0.2) {
      score += Math.round(14 * (1 - ratio / 0.2));
      if (ratio <= 0.08) reasons.push(`BPM proche (${Math.round(other.bpm)} contre ${Math.round(base.bpm)})`);
    }
  }

  const baseMid = mid(base);
  const otherMid = mid(other);
  if (baseMid !== null && otherMid !== null) {
    const gap = Math.abs(baseMid - otherMid);
    if (gap <= 1.5) {
      score += Math.round(14 * (1 - gap / 1.5));
      if (gap <= 0.6) reasons.push(`Difficulté proche (≈ ${otherMid.toFixed(1)}★)`);
    }
  }

  if (base.creator && norm(base.creator) === norm(other.creator)) {
    score += 5;
    reasons.push("Même mappeur");
  }
  if (base.genre && other.genre && base.genre === other.genre) score += 4;
  if (base.language && other.language && base.language === other.language) score += 3;

  return { score: Math.min(100, score), reasons: reasons.slice(0, 4) };
}
