import { useId } from "react";

/**
 * Petits graphiques SVG sans dépendance : courbe (rang, pp, précision) et barres (parties par mois).
 * Responsives (viewBox + largeur 100 %), animés au premier affichage, lisibles par les lecteurs d'écran (`role="img"` + résumé).
 */

const W = 640;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

export function LineChart({
  title,
  values,
  labels,
  invert = false,
  format = (v: number) => String(Math.round(v)),
  color = "var(--accent-strong)",
}: {
  title: string;
  /** Une valeur par point (le plus ancien d'abord) ; null = pas de donnée ce jour-là. */
  values: (number | null)[];
  /** Libellé de chaque point (même longueur que `values`) : on affiche le premier et le dernier. */
  labels?: string[];
  /** Vrai pour un classement : un nombre plus petit est « meilleur » et se dessine plus haut. */
  invert?: boolean;
  format?: (value: number) => string;
  color?: string;
}) {
  const gradient = useId().replace(/:/g, "");
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return null;

  let min = Math.min(...real);
  let max = Math.max(...real);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const margin = (max - min) * 0.1;
  min -= margin;
  max += margin;

  const x = (i: number) => PAD.left + (i / (values.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => {
    const t = (v - min) / (max - min);
    return PAD.top + (invert ? t : 1 - t) * (H - PAD.top - PAD.bottom);
  };

  // Un trait continu par tronçon de points connus.
  const segments: string[] = [];
  let current = "";
  const areas: string[] = [];
  let areaStart = -1;
  let last = -1;
  values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      if (areaStart >= 0) areas.push(`${areaPath(areaStart, last)}`);
      current = "";
      areaStart = -1;
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    if (areaStart < 0) areaStart = i;
    last = i;
  });
  if (current) segments.push(current);
  if (areaStart >= 0) areas.push(areaPath(areaStart, last));

  function areaPath(from: number, to: number) {
    let d = "";
    for (let i = from; i <= to; i++) {
      const v = values[i];
      if (v === null) continue;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
    const base = invert ? PAD.top : H - PAD.bottom;
    return `${d}L${x(to).toFixed(1)} ${base}L${x(from).toFixed(1)} ${base}Z`;
  }

  const lastIndex = values.map((v) => v !== null).lastIndexOf(true);
  const lastValue = values[lastIndex] as number;
  const firstValue = real[0];
  const best = invert ? Math.min(...real) : Math.max(...real);
  const summary = `${title} : de ${format(firstValue)} à ${format(lastValue)}, meilleure valeur ${format(best)}.`;

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={invert ? 0 : 0.35} />
            <stop offset="1" stopColor={color} stopOpacity={invert ? 0.35 : 0} />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            className="grid"
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + (i / 3) * (H - PAD.top - PAD.bottom)}
            y2={PAD.top + (i / 3) * (H - PAD.top - PAD.bottom)}
          />
        ))}
        {areas.map((d, i) => (
          <path key={i} d={d} fill={`url(#${gradient})`} className="area" />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} className="line" stroke={color} pathLength={1} />
        ))}
        <circle className="dot" cx={x(lastIndex)} cy={y(lastValue)} r={5} fill={color} />
      </svg>
      <div className="chart-axis" aria-hidden>
        <span>{labels?.[0] ?? ""}</span>
        <b style={{ color }}>{format(lastValue)}</b>
        <span>{labels?.[values.length - 1] ?? ""}</span>
      </div>
    </figure>
  );
}

export function BarChart({
  title,
  items,
  format = (v: number) => v.toLocaleString("fr-FR"),
}: {
  title: string;
  items: { label: string; value: number }[];
  format?: (value: number) => string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  const peak = items.reduce((a, b) => (b.value > a.value ? b : a));
  const summary = `${title} : pic en ${peak.label} avec ${format(peak.value)}.`;

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="bars" role="img" aria-label={summary}>
        {items.map((item) => (
          <div
            className={`bar-col${item === peak ? " is-peak" : ""}`}
            key={item.label}
            title={`${item.label} : ${format(item.value)}`}
          >
            <i style={{ height: `${Math.max(3, (item.value / max) * 100)}%` }} />
            <span>{item.label.slice(5) || item.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
