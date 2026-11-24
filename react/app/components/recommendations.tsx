import { useEffect, useState } from "react";
import { Link } from "react-router";

import { toTrack } from "~/components/beatmap-card";
import { EmptyState } from "~/components/empty-state";
import { MapMatchCard } from "~/components/map-match-card";
import { useHistory } from "~/lib/history";
import type { Recommendations } from "~/lib/insights";
import type { Track } from "~/lib/player";

const MODES = [
  { id: "osu", label: "Standard" },
  { id: "taiko", label: "Taiko" },
  { id: "fruits", label: "fruits" },
  { id: "mania", label: "Mania" },
];

type State = { phase: "loading" } | { phase: "error"; limited: boolean } | { phase: "ready"; data: Recommendations };

/** « Pour toi » : beatmaps recommandées d'après les habitudes de jeu du joueur connecté (accueil, avant la recherche). */
export function RecommendationsSection() {
  const history = useHistory();
  const [mode, setMode] = useState<string | null>(null);
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    // L'historique local doit être lu : ses consultations alimentent le modèle partagé (comme sur la page Music DNA).
    if (!history.loaded) return;
    const controller = new AbortController();
    setState({ phase: "loading" });
    const params = new URLSearchParams();
    if (mode) params.set("mode", mode);
    const viewed = history.views.slice(0, 20).map((v) => v.id);
    if (viewed.length) params.set("viewed", viewed.join(","));
    fetch(`/api/recommendations${params.size ? `?${params}` : ""}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          setState({ phase: "error", limited: response.status === 429 });
          return;
        }
        const data = (await response.json()) as Recommendations;
        setState({ phase: "ready", data });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error", limited: false });
      });
    return () => controller.abort();
    // Recalculé quand le mode change ou quand l'historique vient d'être lu (pas à chaque beatmap consultée).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, history.loaded]);

  const current = state.phase === "ready" ? state.data.mode : mode;
  const queue =
    state.phase === "ready" ? state.data.items.map(toTrack).filter((track): track is Track => track !== null) : [];

  return (
    <section className="reco" aria-labelledby="reco-title">
      <p className="eyebrow">SELON TES HABITUDES DE JEU</p>
      <h2 id="reco-title">Pour toi</h2>

      <nav className="tabs" aria-label="Mode des recommandations">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`tab${current === m.id ? " is-active" : ""}`}
            aria-pressed={current === m.id}
            translate="no"
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {state.phase === "loading" && (
        <div className="similar-grid" aria-busy="true" aria-label="Analyse de tes habitudes de jeu">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton similar-skeleton" key={i} />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <EmptyState icon="⚠" tone="error" title="Recommandations indisponibles">
          {state.limited
            ? "Trop de recommandations demandées : réessaie dans quelques minutes."
            : "osu! ne répond pas pour le moment : réessaie dans un instant."}
        </EmptyState>
      )}

      {state.phase === "ready" && !state.data.habits && (
        <EmptyState icon="🎯" title="Pas encore de scores dans ce mode">
          Joue quelques parties pour que je comprenne tes habitudes, ou essaie un autre mode ci-dessus.
        </EmptyState>
      )}

      {state.phase === "ready" && state.data.habits && (
        <>
          <ul className="habit-chips" aria-label="Tes habitudes">
            <li>
              ⭐ {state.data.habits.stars.low.toFixed(1)}–{state.data.habits.stars.high.toFixed(1)}★{" "}
              <small>(médiane {state.data.habits.stars.median.toFixed(1)})</small>
            </li>
            {state.data.habits.bpm && <li>♪ tempo ≈ {state.data.habits.bpm} BPM</li>}
            {state.data.habits.genres[0] && (
              <li>
                {state.data.habits.genres[0].name} {Math.round(state.data.habits.genres[0].share * 100)} %
              </li>
            )}
            {state.data.habits.mods.length > 0 && (
              <li>Mods : {state.data.habits.mods.map((m) => `${m.mod} ${Math.round(m.share * 100)} %`).join(" · ")}</li>
            )}
            {state.data.habits.artists.slice(0, 2).map((artist) => (
              <li key={artist}>♥ {artist}</li>
            ))}
          </ul>
          <p className="hint reco-sources">
            Basé sur {state.data.habits.sample.bestScores} meilleurs scores, {state.data.habits.sample.osuFavourites}{" "}
            favoris osu!, {state.data.habits.sample.shosuLists} beatmaps de tes listes,{" "}
            {state.data.habits.sample.viewed} consultées et {state.data.habits.sample.mostPlayed} parmi les plus jouées
            — la même base que ton <Link to="/dna">Music DNA</Link>. Clique sur un pourcentage pour voir comment il est
            calculé.
          </p>
          {state.data.items.length === 0 ? (
            <EmptyState icon="✨" title="Rien de nouveau à te proposer">
              Tu as déjà joué ou gardé tout ce qui correspond à tes habitudes. Lance une recherche pour sortir des
              sentiers battus.
            </EmptyState>
          ) : (
            <div className="similar-grid">
              {state.data.items.map((item) => (
                <MapMatchCard key={item.id} item={item} queue={queue} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
