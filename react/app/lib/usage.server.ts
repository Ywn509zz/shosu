import { cached } from "./cache.server";
import { flushUsageNow, hash } from "./store.server";

/**
 * Quotas et usage (tableau de bord `/admin`). Les compteurs viennent de `usage-buffer.ts` (vidés dans `shosu:usage:<AAAA-MM-JJ>` par
 * `store.server.ts`). Ce sont des **estimations** : seules les commandes envoyées par ce code sont comptées, et les compteurs
 * d'une instance arrêtée avant son vidage (≤ 30 s) sont perdus.
 */

import { appLimits, buildQuotaRows, redisMonthlyLimit, type AppLimitRow, type QuotaRow } from "./quotas";

export type UsageDay = {
  date: string;
  redis: number;
  osu: number;
  gemini: number;
  geminiIn: number;
  geminiOut: number;
  stack: number;
  listen: number;
};

export type UsageLevel = "ok" | "warn" | "crit";

export type UsageSummary = {
  days: UsageDay[];
  today: UsageDay;
  month: UsageDay;
  limits: { redisMonth: number };
  /** Tableau « Limites maximales » : services externes (Redis, Gemini, osu!, Vercel). */
  quotas: QuotaRow[];
  /** Limites que shOsu! s'impose (Stack, écoute, listes). */
  appLimits: AppLimitRow[];
  redisPercent: number;
  /** Projection de fin de mois (commandes Redis) d'après le rythme depuis le début du mois. */
  redisProjection: number;
  level: UsageLevel;
  message: string;
};

const dayKey = (date: string) => `shosu:usage:${date}`;
const empty = (date: string): UsageDay => ({
  date,
  redis: 0,
  osu: 0,
  gemini: 0,
  geminiIn: 0,
  geminiOut: 0,
  stack: 0,
  listen: 0,
});

/** Résumé de l'usage sur les 31 derniers jours (mis en cache 5 min ; `fresh` force un vidage et une relecture). */
export async function getUsageSummary(fresh = false): Promise<UsageSummary> {
  if (fresh) await flushUsageNow();
  const load = async (): Promise<UsageSummary> => {
    const dates = Array.from({ length: 31 }, (_, i) =>
      new Date(Date.now() - (30 - i) * 86_400_000).toISOString().slice(0, 10),
    );
    const rows = await Promise.all(
      dates.map((date) => hash.getAll(dayKey(date)).catch(() => ({}) as Record<string, string>)),
    );
    const days = dates.map((date, i) => {
      const day = empty(date);
      for (const key of Object.keys(day) as (keyof UsageDay)[]) {
        if (key !== "date") day[key] = Number(rows[i][key]) || 0;
      }
      return day;
    });

    const todayDate = dates[dates.length - 1];
    const monthPrefix = todayDate.slice(0, 7);
    const month = empty(monthPrefix);
    for (const day of days) {
      if (!day.date.startsWith(monthPrefix)) continue;
      for (const key of Object.keys(month) as (keyof UsageDay)[]) {
        if (key !== "date") month[key] += day[key];
      }
    }

    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const limit = redisMonthlyLimit();
    const projection = Math.round((month.redis / Math.max(1, dayOfMonth)) * daysInMonth);
    const percent = month.redis / limit;

    let level: UsageLevel = "ok";
    let message = `Redis : ${Math.round(percent * 100)} % du quota mensuel utilisé.`;
    if (percent >= 0.9) {
      level = "crit";
      message = `Redis : ${Math.round(percent * 100)} % du quota mensuel déjà utilisé — risque de coupure des listes.`;
    } else if (percent >= 0.7 || projection >= limit) {
      level = "warn";
      message = `Redis : ${Math.round(percent * 100)} % du quota utilisé, projection de fin de mois à ${projection.toLocaleString("fr-FR")} commandes (limite ${limit.toLocaleString("fr-FR")}).`;
    }
    return {
      days,
      today: days[days.length - 1],
      month,
      limits: { redisMonth: limit },
      quotas: buildQuotaRows(days[days.length - 1], month),
      appLimits: appLimits(),
      redisPercent: percent,
      redisProjection: projection,
      level,
      message,
    };
  };
  return fresh ? load() : cached("usage:summary", 5 * 60_000, load);
}
