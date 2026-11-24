import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

const KEY = "shosu-theme";

/**
 * Bouton lune / soleil : bascule la classe `light-mode` sur <body> (thème clair). Le choix est mémorisé dans ce navigateur ;
 * au premier passage on suit la préférence du système.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* stockage indisponible */
    }
    setLight(stored ? stored === "light" : window.matchMedia?.("(prefers-color-scheme: light)").matches === true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("light-mode", light);
  }, [light]);

  function toggle() {
    const next = !light;
    setLight(next);
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      /* ignoré */
    }
  }

  return (
    <Button id="theme-toggle" className="theme-toggle" aria-label={light ? "Passer au thème sombre" : "Passer au thème clair"} onPress={toggle}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {light ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
        )}
      </svg>
    </Button>
  );
}
