import { useEffect, useState } from "react";

import { toTrack } from "~/components/beatmap-card";
import { EmptyState } from "~/components/empty-state";
import { MapMatchCard } from "~/components/map-match-card";
import type { SimilarMap } from "~/lib/insights";
import type { Track } from "~/lib/player";

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; items: SimilarMap[] };

/** Beatmaps qui ressemblent à celle-ci (artiste, tags, BPM, difficulté) : chargées après l'affichage de la page. */
export function SimilarMaps({ setId }: { setId: number }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [focus, setFocus] = useState<"mix" | "sound">("mix");

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch(`/api/similar?id=${setId}${focus === "sound" ? "&focus=sound" : ""}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { items?: SimilarMap[] };
        setState({ phase: "ready", items: body.items ?? [] });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [setId, focus]);

  const queue =
    state.phase === "ready" ? state.items.map(toTrack).filter((track): track is Track => track !== null) : [];

  return (
    <section aria-labelledby="similar-title">
      <h2 className="section-title" id="similar-title">
        Beatmaps similaires
      </h2>
      <div className="tabs similar-tabs" role="group" aria-label="Type de ressemblance">
        <button
          type="button"
          className={`tab${focus === "mix" ? " is-active" : ""}`}
          aria-pressed={focus === "mix"}
          onClick={() => setFocus("mix")}
        >
          Globale
        </button>
        <button
          type="button"
          className={`tab${focus === "sound" ? " is-active" : ""}`}
          aria-pressed={focus === "sound"}
          onClick={() => setFocus("sound")}
        >
          🎵 Musique proche
        </button>
      </div>

      {state.phase === "loading" && (
        <div className="similar-grid" aria-busy="true" aria-label="Recherche de beatmaps similaires">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton similar-skeleton" key={i} />
          ))}
        </div>
      )}
      {state.phase === "error" && (
        <EmptyState icon="⚠" tone="error" title="Beatmaps similaires indisponibles">
          osu! ne répond pas pour le moment : recharge la page dans un instant.
        </EmptyState>
      )}
      {state.phase === "ready" && state.items.length === 0 && (
        <EmptyState icon="🔎" title="Aucune beatmap vraiment proche">
          Cette beatmap est assez singulière. Essaie l'onglet « {focus === "mix" ? "Musique proche" : "Globale"} », ou
          lance une recherche par artiste.
        </EmptyState>
      )}
      {state.phase === "ready" && state.items.length > 0 && (
        <div className="similar-grid">
          {state.items.map((item) => (
            <MapMatchCard key={item.id} item={item} queue={queue} />
          ))}
        </div>
      )}
    </section>
  );
}
