import { describe, expect, it } from "vitest";

import { isAdminId } from "~/lib/admin.server";
import { bump, drain } from "~/lib/usage-buffer";

describe("compteurs d'usage", () => {
  it("cumulent puis se vident", () => {
    drain();
    bump("osu");
    bump("osu", 2);
    bump("redis", 5);
    bump("gemini", 0);
    expect(drain()).toEqual({ osu: 3, redis: 5 });
    expect(drain()).toEqual({});
  });
});

describe("administrateurs", () => {
  it("sans variable personne n'est admin ; avec, seuls les ids listés", () => {
    delete process.env.ADMIN_USER_IDS;
    expect(isAdminId(38656812)).toBe(false);
    process.env.ADMIN_USER_IDS = "38656812, 37954459";
    expect(isAdminId(38656812)).toBe(true);
    expect(isAdminId(37954459)).toBe(true);
    expect(isAdminId(1)).toBe(false);
    expect(isAdminId(null)).toBe(false);
    delete process.env.ADMIN_USER_IDS;
  });
});
