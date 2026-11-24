import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Affichage progressif d'une longue liste : on montre `step` éléments, puis `step` de plus à chaque fois que
 * l'élément sentinelle (placé après la liste) approche de l'écran. `onEnd` est appelé quand tout est affiché
 * (ex. aller chercher la page suivante côté serveur). `resetKey` remet le compteur à zéro (nouvelle recherche).
 *
 * Sans IntersectionObserver (très vieux navigateur), le bouton « Charger plus » (`more`) reste utilisable.
 */
export function useProgressive(total: number, step: number, resetKey: unknown, onEnd?: () => void) {
  const [count, setCount] = useState(step);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => setCount(step), [resetKey, step]);

  const more = useCallback(() => {
    if (count < totalRef.current) setCount((c) => c + step);
    else endRef.current?.();
  }, [count, step]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, count, total]);

  return { count: Math.min(count, total), sentinel, more, done: count >= total };
}
