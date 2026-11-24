import type { StreamEvent } from "./assistant";
import { GeminiError } from "./gemini.server";

/**
 * Réponse en flux « un objet JSON par ligne » (NDJSON), partagée par Stack et par l'écoute audio.
 * `run` émet des événements ; toute erreur est convertie en un événement `error` portant un simple
 * code : ni clé, ni prompt, ni réponse du modèle ne sortent dans les journaux ou vers le navigateur.
 */
export function streamEvents(run: (emit: (event: StreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true; // le navigateur a fermé la connexion
        }
      };

      try {
        await run(emit);
      } catch (error) {
        if (error instanceof GeminiError) {
          console.error("Gemini error:", error.kind);
          const overloaded = error.status === 503 || error.status === 429;
          emit({ t: "error", code: error.kind === "bad_response" ? "ai_bad_response" : overloaded ? "ai_overloaded" : "ai_unavailable" });
        } else {
          console.error("Stream error:", error instanceof Error ? error.name : "Error");
          emit({ t: "error", code: "assistant_failed" });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Empêche un proxy de regrouper les lignes avant de les envoyer.
      "X-Accel-Buffering": "no",
    },
  });
}
