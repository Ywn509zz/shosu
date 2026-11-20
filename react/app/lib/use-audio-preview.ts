import { useCallback, useEffect, useRef, useState } from "react";

import { previewUrl } from "./osu";

/**
 * Un seul lecteur audio partagé : lancer un aperçu arrête le précédent
 * (équivalent de `stopAllAudios` dans script.js).
 */
export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayingId(null);
  }, []);

  const toggle = useCallback(
    (id: number, file: string) => {
      if (playingId === id) return stop();

      audioRef.current ??= new Audio();
      const audio = audioRef.current;
      audio.pause();
      audio.src = previewUrl(file);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      setPlayingId(id);
      audio.play().catch(() => setPlayingId(null));
    },
    [playingId, stop],
  );

  // Coupe le son en quittant la page.
  useEffect(() => stop, [stop]);

  return { playingId, toggle, stop };
}
