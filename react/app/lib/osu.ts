/** Constantes osu! partagées entre serveur et navigateur (aucun secret ici). */

export const OSU_BASE_URL = "https://osu.ppy.sh";

/** Version allégée d'un beatmapset : ce qui est réellement envoyé au navigateur. */
export type Beatmapset = {
  id: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  /** Modes présents dans le set, en minuscules. */
  modes: string[];
  /** Difficulté (étoiles) de la première difficulté du set. */
  stars: number | null;
  /** Étoiles de la difficulté la plus facile / la plus difficile du set. */
  minStars: number | null;
  maxStars: number | null;
  /** Nom du fichier d'aperçu audio (ex. « 123.mp3 »), ou null. */
  previewFile: string | null;
  /** Tempo du morceau, quand osu! le fournit. */
  bpm?: number | null;
};

export type SearchResponse = {
  beatmapsets: Beatmapset[];
  /** Curseur de la page suivante (null = dernière page). */
  cursor: string | null;
};

export const MODE_OPTIONS = [
  { value: "all", label: "All modes" },
  { value: "osu", label: "Standard", noTranslate: true },
  { value: "taiko", label: "Taiko", noTranslate: true },
  { value: "fruits", label: "fruits", noTranslate: true },
  { value: "mania", label: "Mania", noTranslate: true },
] as const;

export const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ranked", label: "Ranked", noTranslate: true },
  { value: "approved", label: "Approved", noTranslate: true },
  { value: "qualified", label: "Qualified", noTranslate: true },
  { value: "loved", label: "Loved", noTranslate: true },
  { value: "pending", label: "Pending", noTranslate: true },
  { value: "graveyard", label: "Graveyard", noTranslate: true },
  { value: "wip", label: "WIP", noTranslate: true },
  { value: "deleted", label: "Deleted", noTranslate: true },
  { value: "favourite", label: "Favourite", noTranslate: true },
  { value: "unranked", label: "Unranked", noTranslate: true },
] as const;

export const MODE_IDS: string[] = MODE_OPTIONS.map((o) => o.value);
export const STATUS_IDS: string[] = STATUS_OPTIONS.map((o) => o.value);

/** Correspondance mode → paramètre `m` de l'API osu!. */
export const API_MODE: Record<string, number> = { osu: 0, taiko: 1, fruits: 2, mania: 3 };

/** Statuts que la recherche osu! accepte comme filtre (`s`). */
export const API_STATUS = new Set(["ranked", "qualified", "loved", "pending", "wip", "graveyard"]);

export const beatmapsetUrl = (id: number) => `${OSU_BASE_URL}/beatmapsets/${id}`;
export const coverUrl = (id: number) => `https://assets.ppy.sh/beatmaps/${id}/covers/cover.jpg`;
export const previewUrl = (file: string) => `https://b.ppy.sh/preview/${file}`;

/** Couleur des étoiles — mêmes paliers que script.js. */
export function getStarColor(stars: number): string {
  switch (Math.floor(stars)) {
    case 1: return "#4FC0FF";
    case 2: return "#4FFFD5";
    case 3: return "#7CFF4F";
    case 4: return "#F6F05C";
    case 5: return "#FF8068";
    case 6: return "#FF3C71";
    case 7: return "#FF00A0";
    case 8: return "#6563DE";
    case 9: return "#AA00FF";
    default: return "#000000"; // 10+
  }
}

// ---------------------------------------------------------------------------
// Détail d'une beatmap, joueurs et classements
// ---------------------------------------------------------------------------

export type BeatmapDifficulty = {
  id: number;
  mode: string;
  version: string;
  stars: number;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  bpm: number | null;
  lengthSeconds: number | null;
  maxCombo: number | null;
  circles: number | null;
  sliders: number | null;
  spinners: number | null;
};

export type BeatmapsetDetail = Beatmapset & {
  source: string | null;
  tags: string[];
  genre: string | null;
  language: string | null;
  bpm: number | null;
  lengthSeconds: number | null;
  playCount: number | null;
  favouriteCount: number | null;
  rankedDate: string | null;
  creatorId: number | null;
  difficulties: BeatmapDifficulty[];
};

/** Un joueur dans un classement ou une recherche. */
export type PlayerSummary = {
  id: number;
  username: string;
  country: string | null;
  globalRank: number | null;
  countryRank: number | null;
  pp: number | null;
  accuracy: number | null;
  playCount: number | null;
};

export type TopPlay = {
  beatmapsetId: number;
  title: string;
  artist: string;
  version: string;
  stars: number;
  pp: number | null;
  accuracy: number | null;
  mods: string[];
  rank: string;
  bpm: number | null;
  lengthSeconds: number | null;
};

export type PlayerPage = PlayerSummary & {
  mode: string;
  /** Faux quand le joueur n'a jamais joué dans ce mode (aucune statistique à afficher). */
  hasStats: boolean;
  level: number | null;
  playTimeHours: number | null;
  rankedScore: number | null;
  maxCombo: number | null;
  grades: { ss: number; s: number; a: number };
  topPlays: TopPlay[];
};

export const avatarUrl = (id: number) => `https://a.ppy.sh/${id}`;
export const osuDirectUrl = (setId: number) => `osu://s/${setId}`;
export const playerUrl = (id: number) => `${OSU_BASE_URL}/users/${id}`;

/** Drapeau emoji depuis un code pays ISO à deux lettres (« FR » → 🇫🇷). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("fr-FR") : "—";

/** Identifiant (nombre) ou pseudo osu! valide pour une URL de profil. */
export function parsePlayerRef(value: string): { key: "id" | "username"; value: string } | null {
  if (/^\d{1,10}$/.test(value)) return { key: "id", value };
  if (/^[A-Za-z0-9_\[\] -]{2,20}$/.test(value)) return { key: "username", value };
  return null;
}

/** Une rangée de suggestions de la page d'accueil (« les plus jouées », « récentes »…). */
export type DiscoveryLens = { id: string; title: string; items: Beatmapset[] };
