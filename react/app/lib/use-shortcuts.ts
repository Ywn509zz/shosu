import { useEffect, useRef } from "react";

import type { usePlayer } from "./player";

type Handlers = {
  focusSearch: () => void;
  toggleAssistant: () => void;
  player: ReturnType<typeof usePlayer>;
};

/** Vrai si la touche est destinée à un champ de saisie ou à un contrôle (on ne la détourne pas). */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, button, a, [contenteditable='true']") !== null;
}

/**
 * Raccourcis clavier du site :
 *   /       aller à la recherche
 *   S       ouvrir / fermer Stack
 *   Espace  lecture / pause de l'aperçu en cours
 * (Échap ferme Stack ; il est géré dans le panneau.) Aucun raccourci n'agit pendant une saisie.
 */
export function useShortcuts(handlers: Handlers) {
  // Les gestionnaires changent à chaque rendu (le lecteur se met à jour 4 fois par seconde) :
  // on les lit via une référence pour ne brancher l'écouteur clavier qu'une seule fois.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isInteractive(e.target)) return;

      const { focusSearch, toggleAssistant, player } = ref.current;
      if (e.key === "/") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleAssistant();
      } else if (e.key === " " && player.track) {
        e.preventDefault();
        if (player.playing) player.pause();
        else player.resume();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
