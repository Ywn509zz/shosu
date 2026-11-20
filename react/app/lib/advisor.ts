/** Types et constantes du conseiller partagés entre serveur et navigateur. */
import type { Beatmapset } from "./osu";

export const ADVISOR_MODES = ["osu", "taiko", "fruits", "mania"] as const;
export type AdvisorMode = (typeof ADVISOR_MODES)[number];
export const MAX_PREFERENCES_LENGTH = 400;

export type AdvisorResult = {
  summary: string;
  tips: string[];
  range: { min: number; max: number };
  groups: { query: string; reason: string; results: Beatmapset[] }[];
  model: string;
};
