/** Types et constantes de l'assistant partagés entre serveur et navigateur. */
import type { Beatmapset } from "./osu";

export const ASSISTANT_NAME = "Stack";
export const ASSISTANT_TAGLINE = "Ton assistant beatmaps";
export const ASSISTANT_LOGO = "/stack.jpeg";

export const MAX_MESSAGE_LENGTH = 1000;

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type SearchLink = { q: string; mode: string; status: string };

export type AssistantReply = {
  reply: string;
  /** Beatmaps trouvées par les recherches de l'assistant, affichées sous sa réponse. */
  cards: Beatmapset[];
  /** Permet d'ouvrir la dernière recherche dans la page principale. */
  searchLink: SearchLink | null;
  model: string;
};

export const SUGGESTIONS = [
  "Que me conseilles-tu selon mon profil ?",
  "Trouve-moi des maps de stream autour de 6★",
  "Des maps japonaises calmes pour me détendre",
  "Des maps mania pour débuter",
];
