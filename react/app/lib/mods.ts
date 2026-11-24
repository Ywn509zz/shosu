/**
 * Effet des mods sur les statistiques d'une difficulté (formules d'osu!).
 * Pur et sans dépendance : utilisable côté serveur comme côté navigateur.
 */

export type ModStats = {
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  bpm: number | null;
  lengthSeconds: number | null;
};

/** Vitesse de lecture : DT/NC ×1,5, HT ×0,75. */
export function clockRate(mods: readonly string[]): number {
  if (mods.includes("DT") || mods.includes("NC")) return 1.5;
  if (mods.includes("HT")) return 0.75;
  return 1;
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** AR → durée d'apparition (ms) et inversement : c'est ainsi que la vitesse de lecture modifie l'AR. */
const arToMs = (ar: number) => (ar > 5 ? 1200 - 150 * (ar - 5) : 1800 - 120 * ar);
const msToAr = (ms: number) => (ms > 1200 ? (1800 - ms) / 120 : 5 + (1200 - ms) / 150);
/** OD → fenêtre « 300 » (ms). */
const odToMs = (od: number) => 80 - 6 * od;
const msToOd = (ms: number) => (80 - ms) / 6;

/**
 * Statistiques « effectives » avec des mods. `standard` : les formules de CS/AR/OD/HP sont celles du mode
 * standard ; pour les autres modes on ne recalcule que le tempo et la durée (la difficulté vient de l'API).
 */
export function applyMods(base: ModStats, mods: readonly string[], standard: boolean): ModStats {
  const rate = clockRate(mods);
  const hr = mods.includes("HR");
  const ez = mods.includes("EZ");

  const adjust = (value: number | null, hrFactor: number) => {
    if (value === null) return null;
    if (hr) return Math.min(10, value * hrFactor);
    if (ez) return value * 0.5;
    return value;
  };

  let cs = base.cs === null ? null : hr ? Math.min(10, base.cs * 1.3) : ez ? base.cs * 0.5 : base.cs;
  let ar = adjust(base.ar, 1.4);
  let od = adjust(base.od, 1.4);
  const hp = adjust(base.hp, 1.4);

  if (standard) {
    if (ar !== null && rate !== 1) ar = msToAr(arToMs(ar) / rate);
    if (od !== null && rate !== 1) od = msToOd(odToMs(od) / rate);
  } else {
    cs = base.cs;
    ar = base.ar;
    od = base.od;
  }

  return {
    cs: cs === null ? null : round(cs),
    ar: ar === null ? null : round(ar),
    od: od === null ? null : round(od),
    hp: hp === null ? null : round(hp),
    bpm: base.bpm === null ? null : Math.round(base.bpm * rate),
    lengthSeconds: base.lengthSeconds === null ? null : Math.round(base.lengthSeconds / rate),
  };
}

export const modLabel = (mods: readonly string[]) => (mods.length === 0 ? "NM" : mods.join("+"));
