import { PLANS } from "./plans";

/**
 * Limites maximales affichées sur /admin : celles des services gratuits dont dépend shOsu! et celles que le site
 * s'impose à lui-même. Module pur (sans accès réseau) : utilisé par le serveur et testé tel quel.
 *
 * Fiabilité de chaque limite :
 * - « officielle »  : fixée par le service, connue (osu! 60 requêtes/min, Upstash 500 000 commandes/mois…) ;
 * - « configurée »  : valeur de l'environnement (REDIS_MONTHLY_LIMIT, GEMINI_DAILY_LIMIT) ou du code ;
 * - « indicative »  : valeur courante mais qui change selon le compte/le modèle : à vérifier dans la console du service.
 */

/** Limites que shOsu! applique lui-même (partagées avec les routes api.assistant et api.listen). */
export const STACK_GLOBAL_LIMIT = { limit: 200, windowMs: 60 * 60_000 };
export const LISTEN_USER_LIMIT = { limit: 6, windowMs: 10 * 60_000 };
export const LISTEN_GLOBAL_LIMIT = { limit: 60, windowMs: 60 * 60_000 };

export type QuotaReliability = "officielle" | "configurée" | "indicative";

export type QuotaRow = {
  id: string;
  service: string;
  what: string;
  period: string;
  /** Consommation sur la période, ou null quand shOsu! ne peut pas la mesurer. */
  used: number | null;
  /** Maximum sur la période, ou null quand il dépend du compte et n'est pas connu. */
  limit: number | null;
  /** Texte libre quand la limite n'est pas un simple nombre sur la période (ex. « 60 par minute »). */
  limitText?: string;
  reliability: QuotaReliability;
  note: string;
};

export type AppLimitRow = { label: string; value: string };

type Counts = { redis: number; osu: number; gemini: number; stack: number; listen: number };

export function redisMonthlyLimit(env: Record<string, string | undefined> = process.env): number {
  return Number(env.REDIS_MONTHLY_LIMIT) || 500_000;
}

/** Plan gratuit Gemini : requêtes par jour (valeur indicative, modifiable avec GEMINI_DAILY_LIMIT). */
export function geminiDailyLimit(env: Record<string, string | undefined> = process.env): number {
  return Number(env.GEMINI_DAILY_LIMIT) || 1000;
}

export const percentOf = (used: number | null, limit: number | null): number | null =>
  used === null || limit === null || limit <= 0 ? null : used / limit;

/** Lignes du tableau « Limites maximales ». `today` et `month` sont les compteurs de usage.server.ts. */
export function buildQuotaRows(
  today: Counts,
  month: Counts,
  env: Record<string, string | undefined> = process.env,
): QuotaRow[] {
  const redisCustom = Boolean(Number(env.REDIS_MONTHLY_LIMIT));
  const geminiCustom = Boolean(Number(env.GEMINI_DAILY_LIMIT));
  return [
    {
      id: "redis",
      service: "Base de données (Upstash Redis)",
      what: "commandes",
      period: "par mois",
      used: month.redis,
      limit: redisMonthlyLimit(env),
      reliability: redisCustom ? "configurée" : "officielle",
      note: "Plan gratuit : 500 000 commandes par mois et 256 Mo de données (l'espace disque n'est pas mesuré ici : voir la console Upstash). Au-delà, les listes et collections cessent de fonctionner.",
    },
    {
      id: "gemini",
      service: "Gemini (Google) — Stack et l'écoute",
      what: "requêtes",
      period: "par jour",
      used: today.gemini,
      limit: geminiDailyLimit(env),
      reliability: geminiCustom ? "configurée" : "indicative",
      note: "Le plafond du plan gratuit dépend du modèle et du compte (requêtes par minute, par jour, jetons par minute) : le chiffre exact est dans Google AI Studio → Limites de débit. Réglable avec GEMINI_DAILY_LIMIT. En cas de dépassement ou de surcharge, Stack affiche une erreur.",
    },
    {
      id: "osu",
      service: "API osu!",
      what: "requêtes",
      period: "par minute",
      used: null,
      limit: 60,
      limitText: "60 par minute",
      reliability: "officielle",
      note: `osu! recommande de rester sous 60 requêtes par minute (rafales tolérées). Ce site met en cache les réponses pour s'y tenir. Aujourd'hui : ${today.osu.toLocaleString("fr-FR")} appels, ce mois : ${month.osu.toLocaleString("fr-FR")}.`,
    },
    {
      id: "vercel",
      service: "Hébergement (Vercel, plan Hobby)",
      what: "invocations et transfert",
      period: "par mois",
      used: null,
      limit: null,
      limitText: "≈ 1 M d'invocations, 100 Go",
      reliability: "indicative",
      note: "Non mesuré par shOsu! : consulte Vercel → Usage. Valeurs du plan Hobby au moment de l'écriture, susceptibles de changer.",
    },
  ];
}

/** Limites que le site s'impose (lues dans le code : toujours à jour). */
export function appLimits(): AppLimitRow[] {
  const minutes = (ms: number) => ms / 60_000;
  return [
    {
      label: "Messages à Stack par utilisateur",
      value: `${PLANS.free.stackMessagesPer10Min} par ${minutes(10 * 60_000)} min (Gratuit) · ${PLANS.premium.stackMessagesPer10Min} (Premium)`,
    },
    {
      label: "Messages à Stack, tous utilisateurs confondus",
      value: `${STACK_GLOBAL_LIMIT.limit} par heure (protège le quota Gemini)`,
    },
    {
      label: "« Shazam pour osu! » (écoute)",
      value: `${LISTEN_USER_LIMIT.limit} extraits par ${minutes(LISTEN_USER_LIMIT.windowMs)} min par utilisateur · ${LISTEN_GLOBAL_LIMIT.limit} par heure au total`,
    },
    {
      label: "Beatmaps par liste",
      value: `${PLANS.free.listLimit} (Gratuit) · ${PLANS.premium.listLimit} (Premium)`,
    },
    {
      label: "Collections par joueur",
      value: `${PLANS.free.collectionLimit} (Gratuit) · ${PLANS.premium.collectionLimit} (Premium)`,
    },
  ];
}
