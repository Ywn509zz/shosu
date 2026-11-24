import { useEffect, useState } from "react";

import type { DifficultyAnalysis } from "~/lib/insights";
import { formatDuration, formatNumber, getStarColor } from "~/lib/osu";

type State = { phase: "loading" } | { phase: "error"; code: number } | { phase: "ready"; analysis: DifficultyAnalysis };

const PROFILE_TEXT = {
  aim: "Orientée aim : sauts, précision et déplacements du curseur comptent plus que la vitesse.",
  speed: "Orientée vitesse : streams, doubles et endurance comptent plus que le déplacement.",
  balanced: "Équilibrée : aim et vitesse pèsent à peu près autant.",
} as const;

const fmt = (value: number | null, digits = 1) => (value === null ? "—" : value.toFixed(digits));

/** Difficulté d'une beatmap avec chaque mod (EZ, HR, HT, DT…) et décomposition aim / vitesse. */
export function DifficultyAnalysisPanel({ beatmapId }: { beatmapId: number }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch(`/api/analysis?id=${beatmapId}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          setState({ phase: "error", code: response.status });
          return;
        }
        const body = (await response.json()) as { analysis: DifficultyAnalysis };
        setState({ phase: "ready", analysis: body.analysis });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error", code: 0 });
      });
    return () => controller.abort();
  }, [beatmapId]);

  if (state.phase === "loading") {
    return (
      <div className="analysis" aria-busy="true">
        <div className="skeleton analysis-skeleton" />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="analysis">
        <p className="empty">
          {state.code === 429
            ? "Trop d'analyses à la suite : réessaie dans une minute."
            : "L'analyse n'est pas disponible pour le moment."}
        </p>
      </div>
    );
  }

  const { analysis } = state;
  const maxStars = Math.max(...analysis.rows.map((row) => row.stars ?? 0), 1);
  const nm = analysis.rows.find((row) => row.mods.length === 0);
  const skills = analysis.skills;
  const skillMax = skills ? Math.max(skills.aim ?? 0, skills.speed ?? 0, skills.flashlight ?? 0, 0.1) : 1;

  return (
    <div className="analysis">
      {skills && (skills.aim !== null || skills.speed !== null) && (
        <div className="skills">
          <h3>Décomposition de la difficulté</h3>
          {(
            [
              ["Aim", skills.aim],
              ["Vitesse", skills.speed],
              ["Flashlight", skills.flashlight],
            ] as const
          )
            .filter(([, value]) => value !== null && (value > 0 || false))
            .map(([name, value]) => (
              <div className="skill-row" key={name}>
                <span>{name}</span>
                <div className="bar" aria-hidden>
                  <i style={{ width: `${Math.max(4, ((value ?? 0) / skillMax) * 100)}%` }} />
                </div>
                <b>{fmt(value, 2)}</b>
              </div>
            ))}
          {analysis.profile && <p className="skill-note">{PROFILE_TEXT[analysis.profile]}</p>}
          {skills.speedNotes !== null && (
            <p className="skill-note">
              {formatNumber(skills.speedNotes)} notes comptent pour la vitesse
              {skills.sliderFactor !== null ? ` · facteur sliders ${skills.sliderFactor.toFixed(2)}` : ""}.
            </p>
          )}
        </div>
      )}

      <div className="mod-table" role="table" aria-label={`Difficulté de ${analysis.version} avec chaque mod`}>
        <div className="mod-row mod-head" role="row">
          <span role="columnheader">Mods</span>
          <span role="columnheader">Étoiles</span>
          <span role="columnheader">AR</span>
          <span role="columnheader">OD</span>
          <span role="columnheader">CS</span>
          <span role="columnheader">HP</span>
          <span role="columnheader">BPM</span>
          <span role="columnheader">Durée</span>
        </div>
        {analysis.rows.map((row) => {
          const delta = row.stars !== null && nm?.stars != null ? row.stars - nm.stars : null;
          return (
            <div className={`mod-row${row.mods.length === 0 ? " is-base" : ""}`} role="row" key={row.label}>
              <b role="cell" className="mod-name">
                {row.label}
              </b>
              <div role="cell" className="mod-stars">
                <div className="bar" aria-hidden>
                  <i
                    style={{
                      width: `${row.stars === null ? 0 : (row.stars / maxStars) * 100}%`,
                      background: row.stars === null ? undefined : getStarColor(row.stars),
                    }}
                  />
                </div>
                <span style={{ color: row.stars === null ? undefined : getStarColor(row.stars) }}>
                  ⭐ {fmt(row.stars, 2)}
                </span>
                {delta !== null && row.mods.length > 0 && (
                  <small className={delta >= 0 ? "up" : "down"}>
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta).toFixed(2)}
                  </small>
                )}
              </div>
              <span role="cell">{fmt(row.ar)}</span>
              <span role="cell">{fmt(row.od)}</span>
              <span role="cell">{fmt(row.cs)}</span>
              <span role="cell">{fmt(row.hp)}</span>
              <span role="cell">{row.bpm ?? "—"}</span>
              <span role="cell">{formatDuration(row.lengthSeconds)}</span>
            </div>
          );
        })}
      </div>
      {analysis.mode !== "osu" && (
        <p className="skill-note">
          Les étoiles viennent d'osu! pour chaque mod ; AR, OD, CS et HP ne sont recalculés que pour le mode standard.
        </p>
      )}
    </div>
  );
}
