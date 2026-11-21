import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { previewUrl } from "./osu";

export type Track = { id: number; title: string; artist: string; previewFile: string };

type PlayerApi = {
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  /** Lance l'aperçu, le met en pause ou le reprend. `queue` : liste lue à la suite (précédent / suivant). */
  toggle: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
  isPlaying: (id: number) => boolean;
};

const PlayerContext = createContext<PlayerApi | null>(null);
const VOLUME_KEY = "shosu-volume";

/** Un seul lecteur audio pour tout le site : lancer un aperçu arrête le précédent. */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>([]);
  const trackRef = useRef<Track | null>(null);

  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  const start = useCallback((next: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    trackRef.current = next;
    setTrack(next);
    setTime(0);
    setDuration(0);
    audio.src = previewUrl(next.previewFile);
    audio.play().catch(() => setPlaying(false));
  }, []);

  const step = useCallback(
    (delta: 1 | -1) => {
      const queue = queueRef.current;
      const index = queue.findIndex((t) => t.id === trackRef.current?.id);
      const target = index === -1 ? undefined : queue[index + delta];
      if (target) start(target);
      else if (delta === 1) audioRef.current?.pause(); // fin de la file
    },
    [start],
  );

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;

    try {
      const saved = Number(localStorage.getItem(VOLUME_KEY));
      if (Number.isFinite(saved) && saved >= 0 && saved <= 1 && localStorage.getItem(VOLUME_KEY) !== null) {
        setVolumeState(saved);
        audio.volume = saved;
      } else {
        audio.volume = 0.8;
      }
    } catch {
      audio.volume = 0.8;
    }

    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => setTime(audio.currentTime);
    audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => setPlaying(false);
    audio.onended = () => step(1);

    return () => {
      audio.onended = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [step]);

  const api = useMemo<PlayerApi>(
    () => ({
      track,
      playing,
      time,
      duration,
      volume,
      toggle(next, queue) {
        const audio = audioRef.current;
        if (!audio) return;
        if (trackRef.current?.id === next.id) {
          if (audio.paused) audio.play().catch(() => setPlaying(false));
          else audio.pause();
          return;
        }
        queueRef.current = queue && queue.length > 0 ? queue : [next];
        start(next);
      },
      pause: () => audioRef.current?.pause(),
      resume: () => void audioRef.current?.play().catch(() => setPlaying(false)),
      seek(seconds) {
        const audio = audioRef.current;
        if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds);
      },
      setVolume(value) {
        const clamped = Math.min(1, Math.max(0, value));
        setVolumeState(clamped);
        if (audioRef.current) audioRef.current.volume = clamped;
        try {
          localStorage.setItem(VOLUME_KEY, String(clamped));
        } catch {
          /* ignoré */
        }
      },
      next: () => step(1),
      previous: () => step(-1),
      close() {
        const audio = audioRef.current;
        audio?.pause();
        audio?.removeAttribute("src");
        trackRef.current = null;
        queueRef.current = [];
        setTrack(null);
        setPlaying(false);
        setTime(0);
      },
      isPlaying: (id) => playing && track?.id === id,
    }),
    [track, playing, time, duration, volume, start, step],
  );

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer doit être utilisé dans <PlayerProvider>");
  return context;
}
