import { Button } from "@heroui/react";
import { Link } from "react-router";

import { toTrack } from "~/components/beatmap-card";
import { ListButtons } from "~/components/list-buttons";
import type { SimilarMap } from "~/lib/insights";
import { coverUrl, getStarColor } from "~/lib/osu";
import { usePlayer, type Track } from "~/lib/player";

/** Carte compacte d'une beatmap « proche » ou « recommandée » : couverture, raisons, pourcentage, listes, aperçu. */
export function MapMatchCard({ item, queue }: { item: SimilarMap; queue: Track[] }) {
  const player = usePlayer();
  const track = toTrack(item);
  const playing = player.isPlaying(item.id);

  return (
    <article className="similar-card">
      <img src={coverUrl(item.id)} alt="" loading="lazy" width={72} height={72} />
      <div className="similar-body">
        <Link to={`/beatmap/${item.id}`}>{item.title}</Link>
        <p>
          {item.artist} · {item.creator}
          {item.minStars !== null && item.maxStars !== null && (
            <span style={{ color: getStarColor(item.maxStars), fontWeight: 800 }}>
              {" "}
              ⭐ {item.minStars.toFixed(1)}–{item.maxStars.toFixed(1)}
            </span>
          )}
        </p>
        <ul className="similar-reasons">
          {item.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="similar-side">
        <span className="similar-score" title="Correspondance">
          {item.score}%
        </span>
        <div className="card-actions">
          <ListButtons id={item.id} />
          {track && (
            <Button
              className="icon-btn"
              aria-label={`${playing ? "Pause" : "Écouter"} ${item.title}`}
              aria-pressed={playing}
              onPress={() => player.toggle(track, queue)}
            >
              {playing ? "⏸" : "▶"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
