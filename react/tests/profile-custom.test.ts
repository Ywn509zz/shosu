import { describe, expect, it } from "vitest";

import { MAX_BIO, cleanBio, isAccent, isBanner } from "~/lib/profile-custom";

describe("profil personnalisé", () => {
  it("bio : tronquée, sans caractères de contrôle", () => {
    expect(cleanBio("x".repeat(500)).length).toBe(MAX_BIO);
    expect(cleanBio("salut\u0007 tout\u0000le monde")).toBe("salut tout le monde");
    expect(cleanBio(42)).toBe("");
  });
  it("accent et bannière : liste blanche", () => {
    expect(isAccent("rose")).toBe(true);
    expect(isAccent("<script>")).toBe(false);
    expect(isBanner("ocean")).toBe(true);
    expect(isBanner("nope")).toBe(false);
  });
});
