import { describe, expect, it } from "vitest";

import { scoreSimilarity, usefulTags, type SimilarityInput } from "~/lib/similar";

const base: SimilarityInput = {
  id: 1,
  artist: "Camellia",
  creator: "A",
  source: "",
  tags: ["electronic", "speed", "tech", "camellia"],
  genre: "Electronic",
  language: "Japanese",
  bpm: 180,
  minStars: 2,
  maxStars: 6,
  modes: ["osu"],
};

describe("scoreSimilarity", () => {
  it("note mieux une map du même artiste, mêmes tags, BPM et difficulté proches", () => {
    const close = scoreSimilarity(base, { ...base, id: 2, bpm: 185, tags: ["speed", "tech"], minStars: 2.5, maxStars: 6.2 });
    const far = scoreSimilarity(base, { ...base, id: 3, artist: "Autre", tags: ["rock"], bpm: 90, minStars: 7, maxStars: 8, genre: "Rock" });
    expect(close!.score).toBeGreaterThan(far!.score + 40);
    expect(close!.reasons).toContain("Même artiste");
  });

  it("refuse une map sans mode en commun, et la map elle-même", () => {
    expect(scoreSimilarity(base, { ...base, id: 4, modes: ["mania"] })).toBeNull();
    expect(scoreSimilarity(base, base)).toBeNull();
  });

  it("le mode « sound » ignore la difficulté et le mappeur", () => {
    const other = { ...base, id: 5, creator: "A", minStars: 9, maxStars: 10 };
    const mix = scoreSimilarity(base, other, "mix")!;
    const sound = scoreSimilarity(base, other, "sound")!;
    expect(mix.reasons.join()).toContain("Même mappeur");
    expect(sound.reasons.join()).not.toContain("mappeur");
    expect(sound.reasons.join()).not.toContain("Difficulté");
  });

  it("ne dépasse jamais 100", () => {
    expect(scoreSimilarity(base, { ...base, id: 6 })!.score).toBeLessThanOrEqual(100);
  });
});

describe("usefulTags", () => {
  it("retire les mots vides, les mots de l'artiste et les doublons", () => {
    expect(usefulTags(["The", "Camellia", "speed", "Remix", "stream", "speed"], "Camellia")).toEqual(["speed", "stream"]);
  });
});
