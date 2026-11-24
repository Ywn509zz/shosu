import { useEffect, useState } from "react";

import { BarChart, LineChart } from "~/components/charts";
import type { ProgressData } from "~/lib/insights";
import { formatNumber } from "~/lib/osu";

const MODE_LABELS: Record<string, string> = { osu: "Standard", taiko: "Taiko", fruits: "fruits", mania: "Mania" };

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; data: ProgressData };

/** « −12 » / « +340 » avec une couleur : vert quand c'est une progression. Pour un rang, plus petit = mieux. */
function Delta({ value, better, suffix = "" }: { value: number | null; better: "up" | "down"; suffix?: string }) {
  if (value === null) return <small className="delta">—</small>;
  if (value === 0) return <small className="delta">=</small>;
  const good = better === "up" ? value > 0 : value < 0;
  return (
    <small className={`delta ${good ? "is-good" : "is-bad"}`}>
      {value > 0 ? "+" : "−"}
      {formatNumber(Math.abs(value))}
      {suffix}
    </small>
  );
}

/** Suivi de progression d'un joueur : variations, rang sur 90 jours, parties par mois, pp et précision (relevés shOsu!), modes préférés. */
export function ProgressTracker({ playerId, mode, isMe }: { playerId: number; mode: string; isMe?: boolean }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch(`/api/progress?player=${playerId}&mode=${mode}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setState({ phase: "ready", data: (await response.json()) as ProgressData });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [playerId, mode]);

  if (state.phase === "loading") {
    return (
      <section className="progress" aria-busy="true">
        <h2 className="section-title">Suivi de progression</h2>
        <div className="skeleton progress-skeleton" />
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className="progress">
        <h2 className="section-title">Suivi de progression</h2>
        <p className="empty">Le suivi n'est pas disponible pour le moment.</p>
      </section>
    );
  }

  const { data } = state;
  const hasRank = data.rankHistory.filter((r) => r !== null).length >= 2;
  const snaps = data.snapshots;
  const modes = data.modes.filter((m) => m.played);
  const totalPlays = modes.reduce((sum, m) => sum + m.plays, 0);

  return (
    <section className="progress" aria-labelledby="progress-title">
      <h2 className="section-title" id="progress-title">
        Suivi de progression
      </h2>

      <div className="delta-tiles">
        <div className="stat-tile">
          <span>Rang · 7 jours</span>
          <strong>
            {data.current?.rank ? `#${formatNumber(data.current.rank)}` : "—"}{" "}
            <Delta value={data.deltas.rank7} better="down" />
          </strong>
        </div>
        <div className="stat-tile">
          <span>Rang · 30 jours</span>
          <strong>
            {data.current?.rank ? `#${formatNumber(data.current.rank)}` : "—"}{" "}
            <Delta value={data.deltas.rank30} better="down" />
          </strong>
        </div>
        <div className="stat-tile">
          <span>pp · 30 jours</span>
          <strong>
            {data.current?.pp !== null && data.current ? formatNumber(data.current.pp) : "—"}{" "}
            <Delta value={data.deltas.pp30} better="up" suffix=" pp" />
          </strong>
        </div>
        <div className="stat-tile">
          <span>Parties · 30 jours</span>
          <strong>
            {formatNumber(data.current?.plays ?? null)} <Delta value={data.deltas.plays30} better="up" />
          </strong>
        </div>
      </div>

      <div className="chart-grid">
        {hasRank && (
          <LineChart
            title="Rang mondial · 90 derniers jours"
            values={data.rankHistory}
            invert
            format={(v) => `#${formatNumber(v)}`}
            labels={data.rankHistory.map((_, i) =>
              i === 0 ? "il y a 90 j" : i === data.rankHistory.length - 1 ? "aujourd'hui" : "",
            )}
          />
        )}
        <BarChart title="Parties par mois" items={data.monthly.map((m) => ({ label: m.month, value: m.plays }))} />
        {snaps.length >= 2 && (
          <>
            <LineChart
              title="Performance (pp) · relevés shOsu!"
              values={snaps.map((p) => p.pp)}
              labels={snaps.map((p) => p.date.slice(5))}
              format={(v) => `${formatNumber(v)} pp`}
              color="var(--cyan)"
            />
            <LineChart
              title="Précision · relevés shOsu!"
              values={snaps.map((p) => p.accuracy)}
              labels={snaps.map((p) => p.date.slice(5))}
              format={(v) => `${v.toFixed(2)} %`}
              color="#7cff4f"
            />
          </>
        )}
      </div>

      {snaps.length < 2 && (
        <p className="notice">
          {isMe
            ? "Les relevés de pp et de précision se construisent jour après jour : reviens dans quelques jours pour voir tes courbes."
            : "Les courbes de pp et de précision sont disponibles pour les joueurs connectés à shOsu! : le site relève leurs statistiques chaque jour."}{" "}
          Le rang sur 90 jours et les parties par mois viennent directement d'osu!.
        </p>
      )}
      {snaps.length >= 2 && data.tracking.since && (
        <p className="hint">
          Suivi shOsu! depuis le {new Date(data.tracking.since).toLocaleDateString("fr-FR")} · {data.tracking.points}{" "}
          relevé
          {data.tracking.points > 1 ? "s" : ""} en {MODE_LABELS[data.mode] ?? data.mode}.
        </p>
      )}

      {modes.length > 0 && (
        <div className="mode-share">
          <h3>Modes préférés</h3>
          {[...modes]
            .sort((a, b) => b.plays - a.plays)
            .map((m) => (
              <div className="skill-row mode-row" key={m.mode}>
                <span translate="no">{MODE_LABELS[m.mode] ?? m.mode}</span>
                <div className="bar" aria-hidden>
                  <i style={{ width: `${totalPlays ? Math.max(3, (m.plays / totalPlays) * 100) : 0}%` }} />
                </div>
                <b>{totalPlays ? Math.round((m.plays / totalPlays) * 100) : 0} %</b>
              </div>
            ))}
          <p className="skill-note">Part des parties jouées par mode ({formatNumber(totalPlays)} au total).</p>
        </div>
      )}
    </section>
  );
}
