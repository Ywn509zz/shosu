import { ASSISTANT_NAME, type StreamEvent } from "./assistant";

/** Messages affichés pour chaque code d'erreur renvoyé par /api/assistant et /api/listen. */
export const STREAM_ERRORS: Record<string, string> = {
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu! pour continuer.",
  rate_limited: "Trop de demandes d'affilée ! Patiente quelques minutes avant de réessayer.",
  assistant_unavailable: `${ASSISTANT_NAME} n'est pas encore configuré sur ce site.`,
  ai_unavailable: "L'IA est momentanément indisponible. Réessaie dans un instant.",
  ai_bad_response: "L'IA a renvoyé une réponse inexploitable. Réessaie.",
  invalid_request: "Je n'ai pas pu traiter ce message. Essaie de le reformuler.",
  interrupted: "La réponse a été interrompue. Réessaie.",
  audio_invalid: "Je n'ai pas pu lire cet extrait audio. Essaie un extrait plus long ou un autre fichier.",
  audio_too_large: "Cet extrait est trop volumineux. Essaie un extrait plus court.",
};

export const GENERIC_ERROR = "Un problème est survenu. Réessaie dans un instant.";

export function errorMessage(code?: string, plan?: string): string {
  const base = STREAM_ERRORS[code ?? ""] ?? GENERIC_ERROR;
  // Les comptes gratuits apprennent que le plan Premium relève cette limite.
  return code === "rate_limited" && plan === "free" ? `${base} Le plan Premium offre bien plus de messages.` : base;
}

/** Lit un flux « un objet JSON par ligne » (NDJSON) et remet chaque événement à `onEvent`. */
export async function readEvents(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        /* ligne illisible : ignorée */
      }
    }
  }
}
