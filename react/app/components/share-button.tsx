import { Button } from "@heroui/react";
import { useState } from "react";

/**
 * Bouton « Partager » : sur téléphone ouvre la feuille de partage du système, sinon copie le lien shOsu! dans le presse-papiers.
 * `path` est un chemin du site (ex. `/beatmap/123`) : le lien partagé est toujours `<origine du site><path>`.
 */
export function ShareButton({
  path,
  title,
  text,
  label = "🔗 Partager",
}: {
  path: string;
  title: string;
  text?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}${path}`;
    // La feuille de partage native est préférée sur les appareils tactiles (téléphones, tablettes).
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return; // partage annulé
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <Button className="account-btn" onPress={() => void share()} aria-live="polite">
      {state === "copied" ? "✓ Lien copié" : state === "failed" ? "Copie impossible" : label}
    </Button>
  );
}
