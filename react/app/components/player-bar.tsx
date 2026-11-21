import { Button } from "@heroui/react";
import { useEffect } from "react";
import { Link } from "react-router";

import { coverUrl, formatDuration } from "~/lib/osu";
import { usePlayer } from "~/lib/player";

/** Barre de lecture fixe en bas de l'écran : visible dès qu'un aperçu a été lancé. */
export function PlayerBar() {
  const player = usePlayer();
  const { track } = player;

  // Laisse de la place sous le contenu pour que la barre ne le masque pas.
  useEffect(() => {
    document.body.classList.toggle("has-player", track !== null);
    return () => document.body.classList.remove("has-player");
  }, [track]);

  if (!track) return null;

  return (
    <section className="player-bar" aria-label="Lecteur d'aperçu">
      <img src={coverUrl(track.id)} alt="" width={44} height={44} />
      <div className="player-info">
        <Link to={`/beatmap/${track.id}`}>{track.title}</Link>
        <span>{track.artist}</span>
      </div>

      <div className="player-controls">
        <Button className="player-btn" aria-label="Précédent" onPress={player.previous}>
          ⏮
        </Button>
        <Button
          className="player-btn player-main"
          aria-label={player.playing ? "Pause" : "Lecture"}
          onPress={player.playing ? player.pause : player.resume}
        >
          {player.playing ? "⏸" : "▶"}
        </Button>
        <Button className="player-btn" aria-label="Suivant" onPress={player.next}>
          ⏭
        </Button>
      </div>

      <div className="player-progress">
        <span>{formatDuration(player.time)}</span>
        <input
          type="range"
          aria-label="Position dans l'aperçu"
          min={0}
          max={player.duration || 1}
          step={0.1}
          value={Math.min(player.time, player.duration || 1)}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
        <span>{formatDuration(player.duration)}</span>
      </div>

      <label className="player-volume">
        <span aria-hidden>🔊</span>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={player.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
        />
      </label>

      <Button className="player-btn" aria-label="Fermer le lecteur" onPress={player.close}>
        ✕
      </Button>
    </section>
  );
}
