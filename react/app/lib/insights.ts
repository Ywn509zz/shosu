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

/** Ce que les meilleurs scores et les beatmaps favorites d'un joueur disent de ses habitudes. */
export type PlayHabits = {
  /** Nombre de meilleurs scores analysés. */
  plays: number;
  /** Zone de difficulté habituelle : médiane et bornes basse / haute (quartiles). */
  stars: { median: number; low: number; high: number };
  bpm: number | null;
  lengthSeconds: number | null;
  /** Mods les plus joués avec leur part des scores (0 à 1). */
  mods: { mod: string; share: number }[];
  artists: string[];
  tags: string[];
};

export type Recommendation = SimilarMap;

export type Recommendations = {
  mode: string;
  /** Null quand le joueur n'a pas encore de scores dans ce mode. */
  habits: PlayHabits | null;
  items: Recommendation[];
};
