import { describe, expect, it } from "vitest";

import { comparePlayers } from "~/lib/compare-players";
import type { PlayerPage, TopPlay } from "~/lib/osu";

const play = (id: number, over: Partial<TopPlay> = {}): TopPlay => ({
  beatmapsetId: id,
  title: `T${id}`,
  artist: "A",
  version: "x",
  stars: 5,
  pp: 200,
  accuracy: 98,
  mods: [],
  rank: "S",
  bpm: 180,
  lengthSeconds: 120,
  ...over,
});

const player = (over: Partial<PlayerPage>): PlayerPage => ({
  id: 1,
  username: "Alice",
  country: "FR",
  globalRank: 1000,
  countryRank: 50,
  pp: 5000,
  accuracy: 98,
  playCount: 10000,
  mode: "osu",
  hasStats: true,
  level: 100,
  playTimeHours: 500,
  rankedScore: 1,
  maxCombo: 2000,
  grades: { ss: 10, s: 100, a: 50 },
  topPlays: [play(1), play(2)],
  ...over,
});

describe("comparePlayers", () => {
  it("désigne le meilleur rang (le plus petit), les pp et la précision", () => {
    const c = comparePlayers(player({}), player({ id: 2, username: "Bob", globalRank: 500, pp: 6500, accuracy: 96.5 }));
    const row = (label: string) => c.rows.find((r) => r.label === label)!;
    expect(row("Rang mondial").better).toBe("b");
    expect(row("Performance (pp)").better).toBe("b");
    expect(row("Précision").better).toBe("a");
    expect(c.verdict.join(" ")).toMatch(/Bob a 1\s500 pp de plus/); // espace insécable fine du format français
    expect(c.verdict.join(" ")).toContain("Bob est mieux classé");
  });

  it("repère les beatmaps en commun et le style de jeu", () => {
    const a = player({ topPlays: [play(1), play(2, { stars: 6 })] });
    const b = player({ id: 2, username: "Bob", topPlays: [play(2, { stars: 6, pp: 300 }), play(3, { stars: 4 })] });
    const c = comparePlayers(a, b);
    expect(c.common.map((x) => x.beatmapsetId)).toEqual([2]);
    expect(c.common[0].b.pp).toBe(300);
    expect(c.verdict.join(" ")).toContain("1 beatmap en commun");
  });

  it("ne plante pas sans données", () => {
    const empty = player({
      id: 3,
      username: "Nouveau",
      hasStats: false,
      globalRank: null,
      pp: null,
      accuracy: null,
      playCount: null,
      playTimeHours: null,
      topPlays: [],
    });
    const c = comparePlayers(empty, empty);
    expect(c.verdict.length).toBeGreaterThan(0);
  });
});
