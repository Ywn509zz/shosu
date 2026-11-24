import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { toTrack } from "~/components/beatmap-card";
import { ListButtons } from "~/components/list-buttons";
import type { SimilarMap } from "~/lib/insights";
import { coverUrl, getStarColor } from "~/lib/osu";
import { usePlayer, type Track } from "~/lib/player";

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; items: SimilarMap[] };

/** Beatmaps qui ressemblent à celle-ci (artiste, tags, BPM, difficulté) : chargées après l'affichage de la page. */
export function SimilarMaps({ setId }: { setId: number }) {
  const player = usePlayer();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch(`/api/similar?id=${setId}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { items?: SimilarMap[] };
        setState({ phase: "ready", items: body.items ?? [] });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [setId]);

  const queue =
    state.phase === "ready" ? state.items.map(toTrack).filter((track): track is Track => track !== null) : [];

  return (
    <section aria-labelledby="similar-title">
      <h2 className="section-title" id="similar-title">
        Beatmaps similaires
      </h2>

      {state.phase === "loading" && (
        <div className="similar-grid" aria-busy="true" aria-label="Recherche de beatmaps similaires">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton similar-skeleton" key={i} />
          ))}
        </div>
      )}
      {state.phase === "error" && <p className="empty">Impossible de charger les beatmaps similaires pour le moment.</p>}
      {state.phase === "ready" && state.items.length === 0 && (
        <p className="empty">Aucune beatmap vraiment proche n'a été trouvée.</p>
      )}
      {state.phase === "ready" && state.items.length > 0 && (
        <div className="similar-grid">
          {state.items.map((item) => {
            const track = toTrack(item);
            const playing = player.isPlaying(item.id);
            return (
              <article className="similar-card" key={item.id}>
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
                  <span className="similar-score" title="Ressemblance">
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
          })}
        </div>
      )}
    </section>
  );
}
