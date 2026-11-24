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

// ---------------------------------------------------------------------------
// Suivi de progression et analyse des performances
// ---------------------------------------------------------------------------

/** Un relevé quotidien des statistiques d'un joueur (pour un mode). */
export type ProgressPoint = {
  date: string;
  pp: number | null;
  rank: number | null;
  accuracy: number | null;
  plays: number | null;
};

export type ModeSummary = {
  mode: string;
  /** Faux si le joueur n'a jamais joué dans ce mode. */
  played: boolean;
  plays: number;
  hours: number;
  pp: number | null;
  rank: number | null;
};

export type ProgressData = {
  playerId: number;
  username: string;
  mode: string;
  current: {
    pp: number | null;
    rank: number | null;
    countryRank: number | null;
    accuracy: number | null;
    plays: number | null;
    hours: number | null;
    level: number | null;
  } | null;
  /** Les quatre modes : sert à « modes préférés ». */
  modes: ModeSummary[];
  /** Rang mondial des ~90 derniers jours (le plus ancien d'abord ; null = non classé ce jour-là). */
  rankHistory: (number | null)[];
  /** Parties jouées par mois (le plus ancien d'abord). */
  monthly: { month: string; plays: number }[];
  /** Relevés shOsu! (joueurs connectés seulement), le plus ancien d'abord. */
  snapshots: ProgressPoint[];
  tracking: { tracked: boolean; since: string | null; points: number };
  /** Variations calculées ; null quand on n'a pas assez de recul. */
  deltas: {
    rank7: number | null;
    rank30: number | null;
    pp7: number | null;
    pp30: number | null;
    plays7: number | null;
    plays30: number | null;
    accuracy30: number | null;
  };
};

export type PerformanceBand = { label: string; count: number; accuracy: number | null; failRate: number | null };

export type PerformanceFinding = {
  id: string;
  kind: "strength" | "weakness";
  title: string;
  detail: string;
  /** Piste concrète pour progresser (seulement pour les points faibles). */
  advice?: string;
};

export type PerformanceAnalysis = {
  mode: string;
  sample: { best: number; recent: number; fails: number };
  /** Profil de jeu moyen d'après les meilleurs scores. */
  profile: { stars: number | null; bpm: number | null; ar: number | null; cs: number | null; lengthSeconds: number | null };
  byStars: PerformanceBand[];
  byBpm: PerformanceBand[];
  byMods: { label: string; count: number; averagePp: number | null; accuracy: number | null }[];
  findings: PerformanceFinding[];
};
