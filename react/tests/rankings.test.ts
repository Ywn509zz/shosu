import { describe, expect, it } from "vitest";

import { RANKING_MAX_PAGE, parseRankingParams, rankingHref } from "~/lib/rankings";

const parse = (query: string) => parseRankingParams(new URLSearchParams(query));

describe("parseRankingParams", () => {
  it("uses defaults", () => {
    expect(parse("")).toEqual({ mode: "osu", country: "", page: 1 });
  });

  it("accepts valid values and uppercases the country", () => {
    expect(parse("mode=mania&country=fr&page=3")).toEqual({ mode: "mania", country: "FR", page: 3 });
  });

  it("falls back on invalid input", () => {
    expect(parse("mode=../x&country=france&page=abc")).toEqual({ mode: "osu", country: "", page: 1 });
    expect(parse("page=-4").page).toBe(1);
    expect(parse("page=999").page).toBe(RANKING_MAX_PAGE);
  });
});

describe("rankingHref", () => {
  it("omits default values", () => {
    expect(rankingHref({ mode: "osu", country: "", page: 1 })).toBe("/players");
    expect(rankingHref({ mode: "taiko", country: "FR", page: 2 })).toBe("/players?mode=taiko&country=FR&page=2");
  });

  it("round-trips through parseRankingParams", () => {
    const params = { mode: "fruits", country: "JP", page: 5 };
    expect(parse(rankingHref(params).split("?")[1])).toEqual(params);
  });
});
