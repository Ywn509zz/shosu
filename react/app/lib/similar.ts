import type { ScoreLine } from "./insights";
import { finalizeScore, line } from "./score";

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
export type SimilarityResult = { score: number; reasons: string[]; breakdown: ScoreLine[] };

export function scoreSimilarity(
  base: SimilarityInput,
  other: SimilarityInput,
  focus: SimilarityFocus = "mix",
): SimilarityResult | null {
  if (base.id === other.id) return null;
  if (!base.modes.some((m) => other.modes.includes(m))) return null;

  const sound = focus === "sound";
  const lines: ScoreLine[] = [];
  const reasons: string[] = [];
  const same = (x: string | null | undefined, y: string | null | undefined) => Boolean(x && y && norm(x) === norm(y));

  // Artiste
  {
    const max = sound ? 38 : 34;
    const ok = same(base.artist, other.artist);
    lines.push(line("artist", "Artiste", max, ok ? max : 0, ok ? `Même artiste : ${other.artist}` : `Artiste différent (${other.artist || "inconnu"})`, { applicable: Boolean(base.artist) }));
    if (ok) reasons.push("Même artiste");
  }
  // Source (jeu, anime…)
  {
    const max = sound ? 14 : 12;
    const ok = same(base.source, other.source);
    lines.push(line("source", "Source", max, ok ? max : 0, ok ? `Même source : ${other.source}` : base.source ? `Source différente (${other.source || "aucune"})` : "La beatmap de référence n'a pas de source", { applicable: Boolean(base.source) }));
    if (ok) reasons.push(`Même source (${other.source})`);
  }
  // Tags en commun
  {
    const max = sound ? 30 : 26;
    const a = usefulTags(base.tags, base.artist);
    const b = new Set(usefulTags(other.tags, other.artist));
    const shared = a.filter((tag) => b.has(tag));
    const jaccard = shared.length > 0 ? shared.length / (a.length + b.size - shared.length) : 0;
    lines.push(
      line("tags", "Tags", max, Math.min(max, Math.round(jaccard * (sound ? 70 : 60))), shared.length > 0 ? `${shared.length} tag${shared.length > 1 ? "s" : ""} en commun sur ${a.length} : ${shared.slice(0, 4).join(", ")}` : `Aucun tag en commun (${a.length} tag${a.length > 1 ? "s" : ""} de référence)`, { applicable: a.length > 0 }),
    );
    if (shared.length > 0) reasons.push(`Tags communs : ${shared.slice(0, 3).join(", ")}`);
  }
  // BPM
  {
    const max = sound ? 22 : 14;
    const tolerance = sound ? 0.12 : 0.2;
    let points = 0;
    let detail = "BPM inconnu";
    if (base.bpm !== null && base.bpm > 0 && other.bpm !== null) {
      const ratio = Math.abs(base.bpm - other.bpm) / base.bpm;
      const pct = Math.round(ratio * 100);
      if (ratio <= tolerance) {
        points = max * (1 - ratio / tolerance);
        detail = `BPM ${Math.round(other.bpm)} contre ${Math.round(base.bpm)} (écart de ${pct} %)`;
        if (ratio <= 0.08) reasons.push(`BPM ${sound ? "très " : ""}proche (${Math.round(other.bpm)} contre ${Math.round(base.bpm)})`);
      } else {
        detail = `BPM ${Math.round(other.bpm)} contre ${Math.round(base.bpm)} : trop éloigné (écart de ${pct} %, tolérance ${Math.round(tolerance * 100)} %)`;
      }
    }
    lines.push(line("bpm", "BPM", max, points, detail, { applicable: base.bpm !== null && base.bpm > 0 }));
  }
  // Difficulté (mode « mix » seulement)
  if (!sound) {
    const max = 14;
    const baseMid = mid(base);
    const otherMid = mid(other);
    let points = 0;
    let detail = "Difficulté inconnue";
    if (baseMid !== null && otherMid !== null) {
      const gap = Math.abs(baseMid - otherMid);
      if (gap <= 1.5) {
        points = max * (1 - gap / 1.5);
        detail = `Difficulté ≈ ${otherMid.toFixed(1)}★ contre ≈ ${baseMid.toFixed(1)}★ (écart de ${gap.toFixed(1)}★)`;
        if (gap <= 0.6) reasons.push(`Difficulté proche (≈ ${otherMid.toFixed(1)}★)`);
      } else {
        detail = `Difficulté ≈ ${otherMid.toFixed(1)}★ contre ≈ ${baseMid.toFixed(1)}★ : trop éloignée (écart de ${gap.toFixed(1)}★, tolérance 1,5★)`;
      }
    }
    lines.push(line("stars", "Difficulté", max, points, detail, { applicable: baseMid !== null }));
  }
  // Mappeur (mode « mix » seulement)
  if (!sound) {
    const ok = same(base.creator, other.creator);
    lines.push(line("creator", "Mappeur", 5, ok ? 5 : 0, ok ? `Même mappeur : ${other.creator}` : `Mappeur différent (${other.creator || "inconnu"})`, { applicable: Boolean(base.creator) }));
    if (ok) reasons.push("Même mappeur");
  }
  // Genre
  {
    const max = sound ? 12 : 4;
    const ok = Boolean(base.genre && other.genre && base.genre === other.genre);
    lines.push(line("genre", "Genre", max, ok ? max : 0, ok ? `Même genre : ${other.genre}` : `Genre ${other.genre ?? "inconnu"} (référence : ${base.genre ?? "inconnu"})`, { applicable: Boolean(base.genre) }));
    if (ok && sound) reasons.push(`Même genre : ${other.genre}`);
  }
  // Langue
  {
    const max = sound ? 8 : 3;
    const ok = Boolean(base.language && other.language && base.language === other.language);
    lines.push(line("language", "Langue", max, ok ? max : 0, ok ? `Même langue : ${other.language}` : `Langue ${other.language ?? "inconnue"} (référence : ${base.language ?? "inconnue"})`, { applicable: Boolean(base.language) }));
    if (ok && sound && base.language !== "Instrumental") reasons.push(`Même langue : ${other.language}`);
  }

  const { score } = finalizeScore(lines);
  return { score, reasons: reasons.slice(0, 4), breakdown: lines };
}
