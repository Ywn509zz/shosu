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

import { appLimits, buildQuotaRows, percentOf } from "~/lib/quotas";

describe("limites maximales", () => {
  const counts = { redis: 250_000, osu: 40, gemini: 900, stack: 30, listen: 2 };

  it("Redis : 500 000 par défaut, réglable ; Gemini : 1 000 par jour par défaut, réglable", () => {
    const rows = buildQuotaRows(counts, counts, {});
    expect(rows.find((r) => r.id === "redis")).toMatchObject({ limit: 500_000, used: 250_000, reliability: "officielle" });
    expect(rows.find((r) => r.id === "gemini")).toMatchObject({ limit: 1000, used: 900, reliability: "indicative" });
    const custom = buildQuotaRows(counts, counts, { REDIS_MONTHLY_LIMIT: "100000", GEMINI_DAILY_LIMIT: "250" });
    expect(custom.find((r) => r.id === "redis")).toMatchObject({ limit: 100_000, reliability: "configurée" });
    expect(custom.find((r) => r.id === "gemini")).toMatchObject({ limit: 250, reliability: "configurée" });
  });

  it("ce que le site ne mesure pas n'a pas de pourcentage", () => {
    const rows = buildQuotaRows(counts, counts, {});
    expect(percentOf(rows[0].used, rows[0].limit)).toBe(0.5);
    expect(percentOf(rows.find((r) => r.id === "osu")!.used, 60)).toBeNull();
    expect(percentOf(rows.find((r) => r.id === "vercel")!.used, null)).toBeNull();
  });

  it("liste les limites internes lues dans le code", () => {
    const text = appLimits().map((l) => `${l.label} ${l.value}`).join("\n");
    expect(text).toContain("20 par 10 min");
    expect(text).toContain("200 par heure");
  });
});
