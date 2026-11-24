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

export type SimilarityFocus = "mix" | "sound";

/** Noms des genres et langues d'osu! (les résultats de recherche n'en donnent parfois que l'identifiant). */
export const GENRES: Record<number, string> = {
  2: "Video Game", 3: "Anime", 4: "Rock", 5: "Pop", 6: "Other", 7: "Novelty", 9: "Hip Hop", 10: "Electronic", 11: "Metal",
  12: "Classical", 13: "Folk", 14: "Jazz",
};
export const LANGUAGES: Record<number, string> = {
  2: "English", 3: "Japanese", 4: "Chinese", 5: "Instrumental", 6: "Korean", 7: "French", 8: "German", 9: "Swedish",
  10: "Spanish", 11: "Italian", 12: "Russian", 13: "Polish", 14: "Other",
};

/**
 * Note de 0 à 100 et raisons.
 * `focus: "mix"` (défaut) mêle musique et difficulté ; `focus: "sound"` ne regarde que la **musique** (artiste, source, tags, BPM,
 * genre, langue) : ni difficulté ni mappeur, pour trouver des morceaux qui sonnent pareil. Renvoie null si les deux beatmaps n'ont aucun mode en commun
 * (comparer du taiko à du mania n'aurait pas de sens).
 */
export function scoreSimilarity(
  base: SimilarityInput,
  other: SimilarityInput,
  focus: SimilarityFocus = "mix",
): { score: number; reasons: string[] } | null {
  if (base.id === other.id) return null;
  if (!base.modes.some((m) => other.modes.includes(m))) return null;

  const sound = focus === "sound";
  const reasons: string[] = [];
  let score = 0;

  if (base.artist && norm(base.artist) === norm(other.artist)) {
    score += sound ? 38 : 34;
    reasons.push("Même artiste");
  }
  if (base.source && norm(base.source) === norm(other.source)) {
    score += sound ? 14 : 12;
    reasons.push(`Même source (${other.source})`);
  }

  const a = usefulTags(base.tags, base.artist);
  const b = new Set(usefulTags(other.tags, other.artist));
  const shared = a.filter((tag) => b.has(tag));
  if (a.length > 0 && b.size > 0 && shared.length > 0) {
    const jaccard = shared.length / (a.length + b.size - shared.length);
    score += Math.min(sound ? 30 : 26, Math.round(jaccard * (sound ? 70 : 60)));
    reasons.push(`Tags communs : ${shared.slice(0, 3).join(", ")}`);
  }

  if (base.bpm !== null && other.bpm !== null && base.bpm > 0) {
    const gap = Math.abs(base.bpm - other.bpm);
    const ratio = gap / base.bpm;
    const tolerance = sound ? 0.12 : 0.2;
    if (ratio <= tolerance) {
      score += Math.round((sound ? 22 : 14) * (1 - ratio / tolerance));
      if (ratio <= 0.08) reasons.push(`BPM ${sound ? "très " : ""}proche (${Math.round(other.bpm)} contre ${Math.round(base.bpm)})`);
    }
  }

  const baseMid = mid(base);
  const otherMid = mid(other);
  if (!sound && baseMid !== null && otherMid !== null) {
    const gap = Math.abs(baseMid - otherMid);
    if (gap <= 1.5) {
      score += Math.round(14 * (1 - gap / 1.5));
      if (gap <= 0.6) reasons.push(`Difficulté proche (≈ ${otherMid.toFixed(1)}★)`);
    }
  }

  if (!sound && base.creator && norm(base.creator) === norm(other.creator)) {
    score += 5;
    reasons.push("Même mappeur");
  }
  if (base.genre && other.genre && base.genre === other.genre) {
    score += sound ? 12 : 4;
    if (sound) reasons.push(`Même genre : ${other.genre}`);
  }
  if (base.language && other.language && base.language === other.language) {
    score += sound ? 8 : 3;
    if (sound && base.language !== "Instrumental") reasons.push(`Même langue : ${other.language}`);
  }

  return { score: Math.min(100, score), reasons: reasons.slice(0, 4) };
}
