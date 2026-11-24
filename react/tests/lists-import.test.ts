import { describe, expect, it, vi } from "vitest";

const raw = (id: number) => ({
  id,
  title: `T${id}`,
  artist: "A",
  creator: "C",
  status: "ranked",
  beatmaps: [{ mode: "osu", difficulty_rating: 3 }],
});

// 120 favoris chez « osu! », servis par pages de 50.
const FAVOURITES = Array.from({ length: 120 }, (_, i) => raw(i + 1));
const calls: string[] = [];
vi.mock("~/lib/osu.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/osu.server")>()),
  osuGet: async (path: string, params: Record<string, string>) => {
    calls.push(`${path}?offset=${params.offset}&limit=${params.limit}`);
    const offset = Number(params.offset);
    return FAVOURITES.slice(offset, offset + Number(params.limit));
  },
}));

import { getListItems, importOsuFavourites } from "~/lib/lists.server";

describe("import des favoris osu!", () => {
  it("lit toutes les pages, ajoute, puis ignore les doublons à la relance", async () => {
    const first = await importOsuFavourites(5001, 1000);
    expect(first).toEqual({ fetched: 120, added: 120, alreadyThere: 0, skippedByLimit: 0 });
    expect(calls.length).toBe(3); // 50 + 50 + 20
    expect((await getListItems(5001, "favorites")).length).toBe(120);

    const again = await importOsuFavourites(5001, 1000);
    expect(again).toEqual({ fetched: 120, added: 0, alreadyThere: 120, skippedByLimit: 0 });
  });

  it("respecte la limite du plan", async () => {
    const result = await importOsuFavourites(5002, 100);
    expect(result.added).toBe(100);
    expect(result.skippedByLimit).toBe(20);
    expect((await getListItems(5002, "favorites")).length).toBe(100);
  });

  it("n'écrase pas les favoris déjà présents", async () => {
    await importOsuFavourites(5003, 30);
    const result = await importOsuFavourites(5003, 1000);
    expect(result.alreadyThere).toBe(30);
    expect(result.added).toBe(90);
  });
});
