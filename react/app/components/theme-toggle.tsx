import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

/**
 * Bouton 🌙 / ☀️ : bascule la classe `light-mode` sur <body>, exactement comme
 * script.js. Le thème n'est pas mémorisé (sombre à chaque chargement).
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("light-mode", light);
  }, [light]);

  return (
    <Button
      id="theme-toggle"
      aria-label="Changer le thème"
      onPress={() => setLight((value) => !value)}
    >
      {light ? "☀️" : "🌙"}
    </Button>
  );
}
