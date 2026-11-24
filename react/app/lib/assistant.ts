/** Types et constantes de l'assistant partagés entre serveur et navigateur. */
import type { Beatmapset, PlayerSummary } from "./osu";

export const ASSISTANT_NAME = "Stack";
export const ASSISTANT_TAGLINE = "Ton assistant beatmaps";
export const ASSISTANT_LOGO = "/stack.jpeg";

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Un tour de conversation envoyé par le navigateur. `cardIds` : beatmaps affichées sous
 * ce message de l'assistant — elles servent de « liste blanche » aux actions sur les listes.
 */
export type ChatTurn = { role: "user" | "assistant"; text: string; cardIds?: number[] };

export type SearchLink = { q: string; mode: string; status: string };

/** Actions sur la page demandées par l'assistant et exécutées par le navigateur après validation. */
export type UiAction =
  | { type: "show_in_search"; q: string; mode: string; status: string }
  | { type: "open_beatmap"; id: number }
  | { type: "open_player"; id: number }
  | { type: "lists_changed" };

/** Événements du flux de réponse (un objet JSON par ligne). */
export type StreamEvent =
  | { t: "status"; text: string }
  | { t: "delta"; text: string }
  | { t: "cards"; items: Beatmapset[] }
  | { t: "players"; items: PlayerSummary[] }
  | { t: "link"; link: SearchLink }
  | { t: "action"; action: UiAction }
  | { t: "done"; model: string }
  | { t: "error"; code: string };

export const SUGGESTIONS = [
  "Que me conseilles-tu selon mon profil ?",
  "Trouve-moi des maps de stream autour de 6★",
  "Qui sont les 5 meilleurs joueurs français ?",
  "Des maps mania pour débuter",
];

/** Lien vers l'accueil avec une recherche déjà lancée (utilisé par Stack et l'historique). */
export function searchHref(link: SearchLink): string {
  const params = new URLSearchParams({ q: link.q });
  if (link.mode !== "all") params.set("mode", link.mode);
  if (link.status !== "all") params.set("status", link.status);
  return `/?${params}`;
}
