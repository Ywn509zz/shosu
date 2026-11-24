import type { ScoreLine } from "./insights";

/** Fabrique un critère de score. `reason` : courte phrase affichée si le critère rapporte des points. */
export function line(
  key: string,
  label: string,
  max: number,
  points: number,
  detail: string,
  options: { applicable?: boolean } = {},
): ScoreLine {
  const applicable = options.applicable !== false;
  return {
    key,
    label,
    max,
    points: applicable ? Math.max(0, Math.min(max, Math.round(points * 10) / 10)) : 0,
    applicable,
    detail,
  };
}

/**
 * Total de points ÷ total possible des critères applicables, en pourcentage. 100 % = tous les critères applicables au maximum.
 * Fonction pure partagée par la similarité, les recommandations et le Music DNA : un seul calcul, un seul sens du pourcentage.
 */
export function finalizeScore(lines: ScoreLine[]): { score: number; total: number; possible: number } {
  const applicable = lines.filter((l) => l.applicable);
  const possible = applicable.reduce((sum, l) => sum + l.max, 0);
  const total = applicable.reduce((sum, l) => sum + l.points, 0);
  return {
    score: possible > 0 ? Math.min(100, Math.round((100 * total) / possible)) : 0,
    total: Math.round(total * 10) / 10,
    possible,
  };
}
