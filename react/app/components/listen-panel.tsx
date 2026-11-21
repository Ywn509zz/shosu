import { Button } from "@heroui/react";
import { useRef, useState } from "react";

import { audioToWav, MAX_FILE_BYTES, MAX_RECORD_SECONDS, useRecorder } from "~/lib/audio";

export type AudioClip = { wav: Blob; seconds: number };

/**
 * Panneau « Quel est ce son ? » : écoute au micro ou import d'un fichier, converti en petit WAV
 * puis remis à `onClip`. Partagé par la barre de recherche et par Stack.
 */
export function ListenPanel({
  id,
  signedIn,
  busy,
  onClip,
}: {
  id: string;
  signedIn: boolean;
  busy: boolean;
  onClip: (clip: AudioClip) => void;
}) {
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function convert(blob: Blob) {
    setError("");
    if (busy) {
      setError("Une réponse est déjà en cours : réessaie dans un instant.");
      return;
    }
    try {
      onClip(await audioToWav(blob));
    } catch {
      setError("Je n'ai pas pu lire cet audio. Essaie un autre fichier ou un enregistrement plus long.");
    }
  }

  const recorder = useRecorder((blob) => void convert(blob));

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permet de rechoisir le même fichier
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("Ce fichier est trop volumineux (30 Mo maximum).");
      return;
    }
    if (file.type && !file.type.startsWith("audio/")) {
      setError("Ce fichier n'est pas un fichier audio.");
      return;
    }
    void convert(file);
  }

  return (
    <div className="assistant-listen" id={id}>
      <p>
        <strong>🎧 Quel est ce son ?</strong> Fais-moi écouter un morceau ou importe un fichier : je cherche les maps qui l'ont, ou
        qui s'en rapprochent.
      </p>

      {!signedIn ? (
        <div className="assistant-listen-actions">
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      ) : recorder.recording ? (
        <div className="assistant-rec" role="status">
          <span className="rec-dot" aria-hidden />
          <span>
            Écoute en cours… {Math.floor(recorder.seconds)} / {MAX_RECORD_SECONDS} s
          </span>
          <Button className="assistant-chip" onPress={recorder.stop}>
            Terminer
          </Button>
          <Button className="assistant-chip" onPress={recorder.cancel}>
            Annuler
          </Button>
        </div>
      ) : (
        <div className="assistant-listen-actions">
          {recorder.supported !== false && (
            <Button
              className="assistant-chip"
              isDisabled={busy}
              onPress={() => {
                setError("");
                void recorder.start();
              }}
            >
              🎤 Écouter ({MAX_RECORD_SECONDS} s)
            </Button>
          )}
          <Button className="assistant-chip" isDisabled={busy} onPress={() => fileRef.current?.click()}>
            📁 Importer un fichier
          </Button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFileChosen} />
        </div>
      )}

      {(error || recorder.error) && (
        <p className="assistant-listen-error" role="alert">
          {error || recorder.error}
        </p>
      )}
      <p className="assistant-note">
        L'extrait (30 s maximum) est envoyé à Gemini (Google) pour analyse ; shOsu! ne le conserve pas.
      </p>
    </div>
  );
}
