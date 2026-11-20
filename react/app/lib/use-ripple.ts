import { useEffect } from "react";

/**
 * Effet « ripple » de script.js, par délégation d'événement. Comme dans
 * l'original, il ne concerne que les boutons d'action de `.buttons`.
 */
export function useRipple() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest<HTMLElement>(".buttons button");
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const circle = document.createElement("span");
      circle.classList.add("ripple");
      circle.style.width = circle.style.height = `${size}px`;
      circle.style.left = `${e.clientX - rect.left - size / 2}px`;
      circle.style.top = `${e.clientY - rect.top - size / 2}px`;
      button.appendChild(circle);
      circle.addEventListener("animationend", () => circle.remove());
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
