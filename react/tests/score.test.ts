import { describe, expect, it } from "vitest";

import { finalizeScore, line } from "~/lib/score";

describe("score de compatibilité", () => {
  it("100 % = au maximum sur tous les critères applicables", () => {
    const lines = [line("a", "A", 40, 40, "ok"), line("b", "B", 20, 20, "ok")];
    expect(finalizeScore(lines).score).toBe(100);
  });

  it("un critère non applicable ne compte ni dans les points ni dans le maximum", () => {
    const lines = [line("a", "A", 40, 40, "ok"), line("b", "B", 20, 0, "n/a", { applicable: false })];
    const result = finalizeScore(lines);
    expect(result).toEqual({ score: 100, total: 40, possible: 40 });
    expect(lines[1].points).toBe(0);
  });

  it("un score partiel s'explique par ses points : 77 % = 77 / 100", () => {
    const lines = [line("a", "A", 50, 40, ""), line("b", "B", 30, 20, ""), line("c", "C", 20, 17, "")];
    expect(finalizeScore(lines)).toEqual({ score: 77, total: 77, possible: 100 });
  });

  it("les points sont bornés entre 0 et le maximum", () => {
    expect(line("a", "A", 10, 99, "").points).toBe(10);
    expect(line("a", "A", 10, -5, "").points).toBe(0);
  });

  it("aucun critère applicable : 0 %", () => {
    expect(finalizeScore([line("a", "A", 10, 0, "", { applicable: false })]).score).toBe(0);
  });
});
