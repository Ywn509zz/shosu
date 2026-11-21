import { useCallback, useEffect, useRef, useState } from "react";

/** Durée de l'écoute au micro, et réglages de l'extrait envoyé (voir listen.server.ts). */
export const MAX_RECORD_SECONDS = 15;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 30;

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Décode n'importe quel audio lisible par le navigateur (mp3, m4a, ogg, webm…) et le convertit en
 * WAV PCM 16 bits mono 16 kHz de 30 s maximum : petit, universel, et accepté par le serveur.
 * Pour un fichier plus long, on prend 30 s à partir de 30 % du morceau (plutôt que l'intro).
 * Le volume est normalisé : une écoute au micro est souvent très faible.
 */
export async function audioToWav(input: Blob): Promise<{ wav: Blob; seconds: number }> {
  const Context =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Context();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await input.arrayBuffer());
  } finally {
    void context.close();
  }

  const total = decoded.duration;
  const seconds = Math.min(total, MAX_SECONDS);
  const offset = total > MAX_SECONDS ? Math.min(total * 0.3, total - MAX_SECONDS) : 0;

  const offline = new OfflineAudioContext(1, Math.max(1, Math.floor(seconds * SAMPLE_RATE)), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0, offset, seconds);
  const samples = (await offline.startRendering()).getChannelData(0);

  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0.001) {
    const gain = Math.min(8, 0.9 / peak);
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  }

  return { wav: encodeWav(samples), seconds };
}

/** Enregistre le micro (sans traitement : on veut le son brut de la musique) et rend l'extrait à `onDone`. */
export function useRecorder(onDone: (blob: Blob) => void) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const startingRef = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const release = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    // Un seul démarrage à la fois (double clic pendant la demande d'autorisation du micro).
    if (startingRef.current || recorderRef.current?.state === "recording") return;
    startingRef.current = true;
    setError("");
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        release();
        if (!cancelledRef.current && chunks.length > 0) {
          doneRef.current(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        }
      };
      recorderRef.current = recorder;

      recorder.start();
      setSeconds(0);
      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setSeconds(Math.min(elapsed, MAX_RECORD_SECONDS));
        if (elapsed >= MAX_RECORD_SECONDS) stop();
      }, 200);
    } catch (e) {
      release();
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Autorise l'accès au micro dans ton navigateur pour que je puisse écouter."
          : name === "NotFoundError"
            ? "Aucun micro n'a été détecté sur cet appareil."
            : "Impossible de démarrer l'écoute. Réessaie ou importe un fichier.",
      );
    } finally {
      startingRef.current = false;
    }
  }, [release, stop]);

  // Coupe le micro si le composant disparaît en pleine écoute.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
    },
    [release],
  );

  return { supported, recording, seconds, error, start, stop, cancel, clearError: () => setError("") };
}
