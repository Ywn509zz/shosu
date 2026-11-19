import { Button } from "@heroui/react";

import { beatmapsetUrl, coverUrl, getStarColor, type Beatmapset } from "~/lib/osu";

/** Carte de résultat : même structure que `displayPage` dans script.js. */
export function BeatmapCard({
  mapset,
  isPlaying,
  onTogglePreview,
}: {
  mapset: Beatmapset;
  isPlaying: boolean;
  onTogglePreview: (id: number, file: string) => void;
}) {
  return (
    <article className="beatmap-card">
      <div className="card-cover-wrap">
        <img
          className="card-cover"
          src={coverUrl(mapset.id)}
          alt={`Cover de ${mapset.title}`}
          loading="lazy"
        />
        <span className="status-badge">{mapset.status}</span>
      </div>
      <div className="card-content">
        <div className="card-heading">
          <div>
            <p className="card-kicker">{mapset.modes.join(" · ")}</p>
            <h3>{mapset.title}</h3>
            <p className="card-artist">
              {mapset.artist} <span>·</span> {mapset.creator}
            </p>
          </div>
          {mapset.stars !== null && (
            <p className="star-rating" style={{ color: getStarColor(mapset.stars) }}>
              ⭐ {mapset.stars.toFixed(2)}★
            </p>
          )}
        </div>
        <div className="card-footer">
          <a href={beatmapsetUrl(mapset.id)} target="_blank" rel="noopener noreferrer">
            Voir le beatmap <span aria-hidden="true">↗</span>
          </a>
          {mapset.previewFile && (
            <Button
              type="button"
              className="play-btn"
              aria-pressed={isPlaying}
              onPress={() => onTogglePreview(mapset.id, mapset.previewFile!)}
            >
              {isPlaying ? "⏸" : "▶"} <span>{isPlaying ? "Pause" : "Écouter"}</span>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
