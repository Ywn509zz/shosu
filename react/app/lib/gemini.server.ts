/**
 * Client Gemini minimal (API REST, sans dépendance).
 *
 * - La clé reste côté serveur et part dans l'en-tête `x-goog-api-key`
 *   (jamais dans l'URL, donc jamais dans un journal d'accès).
 * - Sortie JSON contrainte par un schéma (`responseSchema`).
 * - Si le modèle principal est saturé ou indisponible (429/5xx/404), on essaie
 *   automatiquement les modèles de repli.
 * - On ne journalise ni la clé, ni le prompt, ni la réponse : seulement un code.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-3.8-flash"];
const ATTEMPT_TIMEOUT_MS = 25_000;

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
};

export async function generateJson(params: {
  system: string;
  prompt: string;
  schema: GeminiSchema;
  temperature?: number;
}): Promise<{ data: unknown; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("not_configured", "GEMINI_API_KEY is not set");

  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastStatus = 0;
  for (const model of models) {
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: [{ role: "user", parts: [{ text: params.prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: params.schema,
            temperature: params.temperature ?? 0.5,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch {
      lastStatus = 0; // délai dépassé ou réseau : modèle suivant
      continue;
    }

    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) {
      throw new GeminiError("rejected", `Gemini rejected the API key (HTTP ${response.status})`);
    }
    if (response.status === 400) {
      throw new GeminiError("bad_response", "Gemini rejected the request (HTTP 400)");
    }
    if (!response.ok) continue; // 404 / 429 / 5xx : modèle suivant

    const body = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    } | null;
    const candidate = body?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text || candidate?.finishReason === "SAFETY") continue;

    try {
      return { data: JSON.parse(text), model };
    } catch {
      continue; // JSON tronqué : on retente avec le modèle suivant
    }
  }

  throw new GeminiError("unavailable", `Gemini unavailable (last status ${lastStatus || "timeout"})`);
}
