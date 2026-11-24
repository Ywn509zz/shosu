/** Types partagés des analyses (beatmaps similaires, difficulté par mod) : serveur et navigateur. */
import type { Beatmapset } from "./osu";

export type SimilarMap = Beatmapset & {
  /** Ressemblance de 0 à 100. */
  score: number;
  /** Raisons lisibles : « Même artiste », « BPM proche »… */
  reasons: string[];
};

export type DifficultyRow = {
  mods: string[];
  label: string;
  stars: number | null;
  ar: number | null;
  od: number | null;
  cs: number | null;
  hp: number | null;
  bpm: number | null;
  lengthSeconds: number | null;
  maxCombo: number | null;
};

export type DifficultyAnalysis = {
  beatmapId: number;
  setId: number;
  mode: string;
  version: string;
  title: string;
  rows: DifficultyRow[];
  /** Décomposition de la difficulté sans mod (quand osu! la fournit : mode standard). */
  skills: {
    aim: number | null;
    speed: number | null;
    flashlight: number | null;
    sliderFactor: number | null;
    speedNotes: number | null;
  } | null;
  /** Orientation de la map d'après aim et vitesse. */
  profile: "aim" | "speed" | "balanced" | null;
};
