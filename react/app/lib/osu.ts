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
  /** Nom du fichier d'aperçu audio (ex. « 123.mp3 »), ou null. */
  previewFile: string | null;
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
