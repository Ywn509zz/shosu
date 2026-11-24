import { describe, expect, it } from "vitest";

import { activeFilterCount, filtersToQuery, matchesRange, parseFilters } from "~/lib/search-filters";

const from = (obj: Record<string, string>) => parseFilters((k) => obj[k] ?? null);

describe("filtres de recherche", () => {
  it("valide, borne et corrige les plages", () => {
    expect(from({ smin: "5", smax: "6.25", bmin: "180" })).toEqual({ starsMin: 5, starsMax: 6.3, bpmMin: 180 });
    expect(from({ smin: "9", smax: "4" })).toEqual({ starsMin: 4, starsMax: 9 }); // plage inversée
    expect(from({ smin: "abc", bmin: "5", lmax: "99999" })).toEqual({}); // hors bornes ou illisible
    expect(from({ sort: "plays_desc" })).toEqual({ sort: "plays_desc" });
    expect(from({ sort: "drop table" })).toEqual({});
  });

  it("ne produit que la syntaxe osu! prévue (aucune injection possible)", () => {
    expect(filtersToQuery(from({ smin: "5", smax: "6", bmin: "180", bmax: "220", lmax: "180" }))).toBe(
      " stars>=5 stars<=6 bpm>=180 bpm<=220 length<=180",
    );
    expect(filtersToQuery(from({ smin: "5 OR artist=x" }))).toBe("");
    expect(filtersToQuery({})).toBe("");
  });

  it("filet de sécurité : plages d'étoiles et de BPM", () => {
    const set = { minStars: 2, maxStars: 5.5, bpm: 170 };
    expect(matchesRange(set, { starsMin: 5 })).toBe(true);
    expect(matchesRange(set, { starsMin: 6 })).toBe(false);
    expect(matchesRange(set, { starsMax: 1.5 })).toBe(false);
    expect(matchesRange(set, { bpmMin: 180 })).toBe(false);
    expect(matchesRange(set, { bpmMax: 200, bpmMin: 150 })).toBe(true);
  });

  it("compte les filtres actifs", () => {
    expect(activeFilterCount({ starsMin: 5, sort: "ranked_desc" })).toBe(2);
  });
});
