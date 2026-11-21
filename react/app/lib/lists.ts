/** Listes de beatmaps de chaque joueur : constantes et types partagés (serveur + navigateur). */
import type { Beatmapset } from "./osu";

export const LIST_IDS = ["favorites", "later"] as const;
export type ListId = (typeof LIST_IDS)[number];

export const LIST_LABELS: Record<ListId, string> = {
  favorites: "Favoris",
  later: "À jouer plus tard",
};

export const MAX_LIST_ITEMS = 200;

export type ListItem = Beatmapset & { addedAt: number };

export const isListId = (value: unknown): value is ListId =>
  typeof value === "string" && (LIST_IDS as readonly string[]).includes(value);
