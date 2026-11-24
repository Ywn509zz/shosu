import type { Collection } from "./collections";

/** Messages affichés pour les erreurs renvoyées par /api/collections. */
export const COLLECTION_ERRORS: Record<string, string> = {
  collection_limit: "Tu as atteint le nombre maximal de collections de ton plan.",
  list_full: "Cette collection est pleine.",
  beatmap_not_found: "Impossible de retrouver cette beatmap chez osu!.",
  not_found: "Cette collection n'existe plus.",
  invalid_name: "Donne un nom à ta collection (60 caractères maximum).",
  rate_limited: "Trop d'actions d'affilée. Patiente un instant.",
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu!.",
  storage_not_persistent: "Le stockage n'est pas configuré sur ce site.",
};

export type CollectionCall =
  | { action: "create"; name: string }
  | { action: "rename"; id: string; name: string }
  | { action: "share"; id: string; public: boolean }
  | { action: "delete"; id: string }
  | { action: "add" | "remove"; id: string; setId: number }
  | { action: "clone"; id: string };

/** Appelle /api/collections ; renvoie la collection touchée, ou un message d'erreur lisible. */
export async function callCollections(
  call: CollectionCall,
): Promise<{ ok: true; collection?: Collection } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(call),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; collection?: Collection } | null;
    if (!response.ok) return { ok: false, message: COLLECTION_ERRORS[body?.error ?? ""] ?? "Action impossible pour le moment." };
    return { ok: true, collection: body?.collection };
  } catch {
    return { ok: false, message: "Action impossible pour le moment." };
  }
}
