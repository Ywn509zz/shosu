import { Button } from "@heroui/react";
import { Link } from "react-router";

import { ListButtons } from "~/components/list-buttons";
import { beatmapsetUrl, coverUrl, getStarColor, type Beatmapset } from "~/lib/osu";
import { usePlayer, type Track } from "~/lib/player";

export function toTrack(mapset: Beatmapset): Track | null {
  return mapset.previewFile
    ? { id: mapset.id, title: mapset.title, artist: mapset.artist, previewFile: mapset.previewFile }
    : null;
}

/**
 * Carte de résultat : même structure que `displayPage` dans script.js, avec en plus les
 * boutons de listes, le lien vers la page détail et le lecteur global (`queue` = liste
 * jouée à la suite avec ⏮ / ⏭).
 */
export function BeatmapCard({ mapset, queue }: { mapset: Beatmapset; queue?: Beatmapset[] }) {
  const player = usePlayer();
  const playing = player.isPlaying(mapset.id);
  const track = toTrack(mapset);

  return (
    <article className="beatmap-card">
      <div className="card-cover-wrap">
        <img className="card-cover" src={coverUrl(mapset.id)} alt={`Cover de ${mapset.title}`} loading="lazy" />
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
          <div className="card-links">
            <a href={beatmapsetUrl(mapset.id)} target="_blank" rel="noopener noreferrer">
              Voir le beatmap <span aria-hidden="true">↗</span>
            </a>
            <Link to={`/beatmap/${mapset.id}`}>Détails</Link>
          </div>
          <div className="card-actions">
            <ListButtons id={mapset.id} />
            {track && (
              <Button
                type="button"
                className="play-btn"
                aria-pressed={playing}
                onPress={() =>
                  player.toggle(
                    track,
                    (queue ?? [mapset]).map(toTrack).filter((t): t is Track => t !== null),
                  )
                }
              >
                {playing ? "⏸" : "▶"} <span>{playing ? "Pause" : "Écouter"}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
