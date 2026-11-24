import { describe, expect, it } from "vitest";

import { compareSets } from "~/lib/compare";
import type { BeatmapsetDetail } from "~/lib/osu";

const set = (over: Partial<BeatmapsetDetail>): BeatmapsetDetail => ({
  id: 1,
  title: "A",
  artist: "X",
  creator: "M",
  status: "ranked",
  modes: ["osu"],
  stars: 3,
  minStars: 2,
  maxStars: 4,
  previewFile: null,
  bpm: 150,
  source: null,
  tags: [],
  genre: "Rock",
  language: "English",
  lengthSeconds: 120,
  playCount: 1000,
  favouriteCount: 10,
  rankedDate: null,
  creatorId: 1,
  difficulties: [],
  ...over,
});

describe("compareSets", () => {
  it("désigne la plus difficile, la plus rapide et la plus longue", () => {
    const c = compareSets(set({ title: "Lente", maxStars: 4, bpm: 120, lengthSeconds: 100 }), set({ id: 2, title: "Dure", maxStars: 7, bpm: 200, lengthSeconds: 200 }));
    expect(c.verdict.join(" ")).toContain("« Dure » est plus difficile");
    expect(c.verdict.join(" ")).toContain("« Dure » est plus rapide");
    expect(c.verdict.join(" ")).toContain("« Dure » est plus longue");
    expect(c.rows.find((r) => r.label === "Difficulté max")!.higher).toBe("b");
  });

  it("égalité : aucune valeur mise en avant", () => {
    const c = compareSets(set({}), set({ id: 2 }));
    expect(c.rows.find((r) => r.label === "BPM")!.higher).toBeNull();
  });
});
