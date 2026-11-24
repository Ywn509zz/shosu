import { describe, expect, it } from "vitest";

import { applyMods, clockRate, modLabel } from "~/lib/mods";

const base = { cs: 4, ar: 9, od: 8, hp: 5, bpm: 180, lengthSeconds: 120 };

describe("applyMods (formules d'osu!)", () => {
  it("DT : AR 9 → 10,3, OD 8 → 9,8, BPM ×1,5, durée ÷1,5", () => {
    const dt = applyMods(base, ["DT"], true);
    expect(dt.ar).toBeCloseTo(10.3, 1);
    expect(dt.od).toBeCloseTo(9.8, 1);
    expect(dt.bpm).toBe(270);
    expect(dt.lengthSeconds).toBe(80);
  });

  it("HR plafonne à 10 et agrandit CS", () => {
    const hr = applyMods(base, ["HR"], true);
    expect(hr.ar).toBe(10);
    expect(hr.od).toBe(10);
    expect(hr.cs).toBeCloseTo(5.2, 1);
  });

  it("EZ divise par deux", () => {
    const ez = applyMods(base, ["EZ"], true);
    expect(ez.cs).toBe(2);
    expect(ez.ar).toBe(4.5);
  });

  it("hors mode standard, AR/OD/CS restent ceux d'osu! (seuls tempo et durée changent)", () => {
    const dt = applyMods(base, ["DT"], false);
    expect(dt.ar).toBe(9);
    expect(dt.bpm).toBe(270);
  });

  it("vitesse de lecture et libellé", () => {
    expect(clockRate(["HT"])).toBe(0.75);
    expect(clockRate(["NC"])).toBe(1.5);
    expect(modLabel([])).toBe("NM");
    expect(modLabel(["DT", "HR"])).toBe("DT+HR");
  });
});
