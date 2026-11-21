/**
 * Client Gemini minimal (API REST, sans dépendance), en flux, avec appel d'outils.
 *
 * - La clé reste côté serveur et part dans l'en-tête `x-goog-api-key`
 *   (jamais dans l'URL, donc jamais dans un journal d'accès).
 * - Si le modèle principal est saturé ou indisponible (429/5xx/404), on essaie
 *   automatiquement les modèles de repli. Une fois un modèle choisi pour une
 *   conversation, on le garde : les « thought signatures » des modèles Gemini 3
 *   sont propres à un modèle.
 * - On ne journalise ni la clé, ni le prompt, ni la réponse : seulement un code.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-3.8-flash"];

export class GeminiError extends Error {
  constructor(
    readonly kind: "not_configured" | "rejected" | "unavailable" | "bad_response",
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export const isGeminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

/** Sous-ensemble du schéma OpenAPI accepté par Gemini. */
export type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  description?: string;
  enum?: string[];
};

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: GeminiSchema;
};

/** Une « part » d'un message Gemini. Les champs inconnus (signatures) sont conservés tels quels. */
export type GeminiPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [key: string]: unknown;
};

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

// ---------------------------------------------------------------------------
// Streaming (SSE) : les réponses s'affichent au fil de leur génération.
// ---------------------------------------------------------------------------

export type GeminiStreamEvent =
  /** Nouvelles « parts » reçues (texte, appel d'outil…). */
  | { type: "parts"; parts: GeminiPart[] }
  /** Fin du tour : le message complet du modèle, à renvoyer tel quel dans l'historique. */
  | { type: "end"; content: GeminiContent; model: string };

const STREAM_TIMEOUT_MS = 45_000;
/** Sans aucun fragment au bout de ce délai, on abandonne ce modèle et on passe au suivant. */
const FIRST_CHUNK_TIMEOUT_MS = 12_000;

/** Comme `generateContent`, mais en flux. Le repli de modèle n'est possible qu'avant le premier fragment. */
export async function* streamContent(params: {
  system: string;
  contents: GeminiContent[];
  tools?: GeminiFunctionDeclaration[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): AsyncGenerator<GeminiStreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("not_configured", "GEMINI_API_KEY is not set");

  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = params.model ? [params.model] : [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastStatus = 0;
  for (const model of models) {
    const watchdog = new AbortController();
    const firstChunkTimer = setTimeout(() => watchdog.abort(), FIRST_CHUNK_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: params.contents,
          ...(params.tools?.length
            ? {
                tools: [{ functionDeclarations: params.tools }],
                toolConfig: { functionCallingConfig: { mode: "AUTO" } },
              }
            : {}),
          generationConfig: {
            temperature: params.temperature ?? 0.6,
            maxOutputTokens: params.maxOutputTokens ?? 1500,
          },
        }),
        signal: AbortSignal.any([watchdog.signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)]),
      });
    } catch {
      clearTimeout(firstChunkTimer);
      lastStatus = 0;
      continue;
    }

    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) {
      clearTimeout(firstChunkTimer);
      throw new GeminiError("rejected", `Gemini rejected the API key (HTTP ${response.status})`);
    }
    if (response.status === 400) {
      clearTimeout(firstChunkTimer);
      throw new GeminiError("bad_response", "Gemini rejected the request (HTTP 400)");
    }
    if (!response.ok || !response.body) {
      clearTimeout(firstChunkTimer);
      continue;
    }

    const all: GeminiPart[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Les événements SSE sont séparés par une ligne vide.
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const event of events) {
          const payload = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("");
          if (!payload) continue;

          let chunk: { candidates?: { content?: GeminiContent; finishReason?: string }[] };
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason === "SAFETY" && all.length === 0) continue;

          const parts = candidate?.content?.parts ?? [];
          if (parts.length > 0) {
            clearTimeout(firstChunkTimer);
            all.push(...parts);
            yield { type: "parts", parts };
          }
        }
      }
    } catch (error) {
      if (all.length === 0) continue; // rien reçu : on tente le modèle suivant
      throw new GeminiError("unavailable", "Gemini stream interrupted");
    } finally {
      clearTimeout(firstChunkTimer);
      reader.releaseLock?.();
    }

    if (all.length === 0) continue;
    yield { type: "end", content: { role: "model", parts: all }, model };
    return;
  }

  throw new GeminiError("unavailable", `Gemini unavailable (last status ${lastStatus || "timeout"})`);
}
