import { useEffect, useState } from "react";

import type { PerformanceAnalysis } from "~/lib/insights";
import { formatDuration } from "~/lib/osu";

type State =
  { phase: "loading" } | { phase: "error"; code: number } | { phase: "ready"; analysis: PerformanceAnalysis };

/** Analyse des performances : forces et points faibles (avec une piste pour progresser), accuracy par difficulté et par mod. */
export function PerformanceAnalysisSection({ playerId, mode }: { playerId: number; mode: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch(`/api/performance?player=${playerId}&mode=${mode}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          setState({ phase: "error", code: response.status });
          return;
        }
        const body = (await response.json()) as { analysis: PerformanceAnalysis };
        setState({ phase: "ready", analysis: body.analysis });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error", code: 0 });
      });
    return () => controller.abort();
  }, [playerId, mode]);

  if (state.phase === "loading") {
    return (
      <section className="performance" aria-busy="true">
        <h2 className="section-title">Analyse des performances</h2>
        <div className="skeleton progress-skeleton" />
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="performance">
        <h2 className="section-title">Analyse des performances</h2>
        <p className="empty">
          {state.code === 429
            ? "Trop d'analyses à la suite : réessaie dans une minute."
            : "L'analyse n'est pas disponible pour le moment."}
        </p>
      </section>
    );
  }

  const { analysis } = state;
  const weaknesses = analysis.findings.filter((f) => f.kind === "weakness");
  const strengths = analysis.findings.filter((f) => f.kind === "strength");
  const maxAcc = Math.max(...analysis.byStars.map((b) => b.accuracy ?? 0), 1);
  const minAcc = Math.min(...analysis.byStars.filter((b) => b.accuracy !== null).map((b) => b.accuracy!), 100);

  return (
    <section className="performance" aria-labelledby="performance-title">
      <h2 className="section-title" id="performance-title">
        Analyse des performances
      </h2>

      {analysis.sample.best < 10 ? (
        <p className="empty">
          Pas encore assez de scores dans ce mode pour une analyse fiable (il en faut une dizaine).
        </p>
      ) : (
        <>
          <p className="hint">
            D'après {analysis.sample.best} meilleurs scores et {analysis.sample.recent} parties récentes (
            {analysis.sample.fails} échecs). Calculé par shOsu! à partir des scores publics.
          </p>

          <div className="findings">
            {weaknesses.length === 0 && strengths.length === 0 && (
              <p className="empty">Rien de marquant : ton jeu est équilibré sur les critères analysés.</p>
            )}
            {weaknesses.map((f) => (
              <article className="finding is-weakness" key={f.id}>
                <h3>
                  <span aria-hidden>⚠</span> {f.title}
                </h3>
                <p>{f.detail}</p>
                {f.advice && <p className="advice">💡 {f.advice}</p>}
              </article>
            ))}
            {strengths.map((f) => (
              <article className="finding is-strength" key={f.id}>
                <h3>
                  <span aria-hidden>✓</span> {f.title}
                </h3>
                <p>{f.detail}</p>
              </article>
            ))}
          </div>

          <div className="perf-grid">
            <div className="chart">
              <h3 className="chart-title">Précision par difficulté</h3>
              {analysis.byStars.map((band) => (
                <div className="skill-row" key={band.label}>
                  <span>{band.label}</span>
                  <div className="bar" aria-hidden>
                    <i
                      style={{
                        width: `${band.accuracy === null ? 0 : Math.max(6, ((band.accuracy - (minAcc - 2)) / (maxAcc - (minAcc - 2))) * 100)}%`,
                      }}
                    />
                  </div>
                  <b>{band.accuracy === null ? "—" : `${band.accuracy.toFixed(1)} %`}</b>
                </div>
              ))}
              <p className="skill-note">
                Échecs récents :{" "}
                {analysis.byStars
                  .filter((b) => b.failRate !== null)
                  .map((b) => `${b.label} ${Math.round(b.failRate! * 100)} %`)
                  .join(" · ") || "pas assez de parties récentes"}
              </p>
            </div>

            <div className="chart">
              <h3 className="chart-title">Par mods</h3>
              {analysis.byMods.map((group) => (
                <div className="skill-row mods-row" key={group.label}>
                  <span>{group.label}</span>
                  <small>{group.count} scores</small>
                  <b>{group.averagePp === null ? "—" : `${group.averagePp} pp`}</b>
                </div>
              ))}
              <p className="skill-note">
                Profil moyen : {analysis.profile.stars?.toFixed(1) ?? "—"}★ · {analysis.profile.bpm ?? "—"} BPM · AR{" "}
                {analysis.profile.ar ?? "—"} · {formatDuration(analysis.profile.lengthSeconds)}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
