import { describe, expect, it } from "vitest";

import { buildTaste, deriveSkill, tempoOf, type TasteDetail } from "~/lib/model.server";
import type { RawScore } from "~/lib/player-data.server";

const score = (stars: number, over: Partial<RawScore> = {}, bpm = 180): RawScore => ({
  beatmap: { difficulty_rating: stars, mode: "osu", bpm, total_length: 120 },
  beatmapset: { id: Math.round(stars * 100), artist: "A" },
  mods: [],
  ...over,
});

describe("deriveSkill (compétence)", () => {
  it("médiane, quartiles et BPM médian des meilleurs scores", () => {
    const best = [3, 4, 5, 6, 7, 8, 9, 10].map((s) => score(s));
    const skill = deriveSkill(best)!;
    expect(skill.plays).toBe(8);
    expect(skill.stars.median).toBe(7);
    expect(skill.stars.low).toBe(5);
    expect(skill.stars.high).toBe(9);
    expect(skill.bpmMedian).toBe(180);
  });

  it("compte les mods (NF/SD/PF ignorés, objets ou chaînes) et garde ceux joués ≥ 10 %", () => {
    const best = [
      ...Array.from({ length: 6 }, () => score(5, { mods: ["HD", "NF"] })),
      ...Array.from({ length: 3 }, () => score(5, { mods: [{ acronym: "DT" }] })),
      ...Array.from({ length: 2 }, () => score(5, { mods: ["HR"] })), // 2 / 20 = 10 %
      ...Array.from({ length: 9 }, () => score(5)),
    ];
    const skill = deriveSkill(best)!;
    expect(skill.mods.map((m) => m.mod)).toEqual(["HD", "DT", "HR"]);
    expect(skill.mods[0].share).toBeCloseTo(0.3, 2);
  });

  it("sans score : null", () => {
    expect(deriveSkill([])).toBeNull();
  });
});

const detail = (over: Partial<TasteDetail>): TasteDetail => ({ genre: "Rock", language: "English", bpm: 170, artist: "X", tags: [], lengthSeconds: 150, ...over });

describe("buildTaste (goûts)", () => {
  it("pondère les genres, le tempo et compte les artistes sur TOUTES les sources", () => {
    const entries = [
      { id: 1, weight: 3, artist: "Camellia" },
      { id: 2, weight: 3, artist: "Camellia" },
      { id: 3, weight: 1, artist: "Autre" },
      { id: 4, weight: 1, artist: "Sans détail" }, // pas de détail : compte pour l'artiste seulement
    ];
    const details = new Map<number, TasteDetail | null>([
      [1, detail({ genre: "Electronic", bpm: 180 })],
      [2, detail({ genre: "Electronic", bpm: 180 })],
      [3, detail({ genre: "Rock", bpm: 100 })],
      [4, null],
    ]);
    const taste = buildTaste(entries, details)!;
    expect(taste.genres[0]).toEqual({ name: "Electronic", share: 0.86 }); // 6 / 7
    expect(taste.artists[0]).toBe("Camellia");
    expect(taste.artists).toContain("Sans détail");
    expect(taste.bpm.average).toBe(169); // (180×3 + 180×3 + 100×1) / 7 ≈ 168,6
    expect(taste.bpm.histogram.find((h) => h.label === "180")!.value).toBe(6);
    expect(taste.signature).toContain("Électro");
  });

  it("filtre les tags peu pesants et sans donnée : null", () => {
    expect(buildTaste([], new Map())).toBeNull();
    const taste = buildTaste([{ id: 1, weight: 1, artist: "A" }], new Map([[1, detail({ tags: ["speed"] })]]))!;
    expect(taste.tags).toEqual([]); // un seul tag de poids 1 < 4
  });

  it("mots de tempo", () => {
    expect([100, 140, 180, 220, null].map(tempoOf)).toEqual(["lent", "médium", "rapide", "très rapide", "inconnu"]);
  });
});
