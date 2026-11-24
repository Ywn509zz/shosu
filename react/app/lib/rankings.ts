/** Paramètres de la page « Joueurs » (/players), partagés entre le serveur et le navigateur. */

export const RANKING_MODES = [
  { id: "osu", label: "Standard" },
  { id: "taiko", label: "Taiko" },
  { id: "fruits", label: "Fruits" },
  { id: "mania", label: "Mania" },
] as const;

/** Pays proposés dans le menu (n'importe quel code à 2 lettres reste accepté dans l'adresse). */
export const RANKING_COUNTRIES = [
  ["FR", "France"],
  ["US", "États-Unis"],
  ["KR", "Corée du Sud"],
  ["JP", "Japon"],
  ["DE", "Allemagne"],
  ["GB", "Royaume-Uni"],
  ["CA", "Canada"],
  ["BR", "Brésil"],
  ["RU", "Russie"],
  ["CN", "Chine"],
  ["PL", "Pologne"],
  ["ES", "Espagne"],
  ["IT", "Italie"],
  ["BE", "Belgique"],
  ["CH", "Suisse"],
  ["AU", "Australie"],
] as const;

export const RANKING_PAGE_SIZE = 50;
export const RANKING_MAX_PAGE = 20; // osu! n'expose que les 10 000 premiers : 200 pages de 50, on en garde 20 (top 1 000)

export type RankingParams = { mode: string; country: string; page: number };

/** Lit et assainit les paramètres d'adresse : un mode ou un pays invalide retombe sur la valeur par défaut. */
export function parseRankingParams(params: URLSearchParams): RankingParams {
  const mode = RANKING_MODES.find((m) => m.id === params.get("mode"))?.id ?? "osu";
  const rawCountry = (params.get("country") ?? "").trim();
  const country = /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : "";
  const rawPage = Math.floor(Number(params.get("page")));
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), RANKING_MAX_PAGE) : 1;
  return { mode, country, page };
}

/** Adresse de la page pour des paramètres donnés (les valeurs par défaut sont omises). */
export function rankingHref({ mode, country, page }: RankingParams): string {
  const query = new URLSearchParams();
  if (mode !== "osu") query.set("mode", mode);
  if (country) query.set("country", country);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/players?${text}` : "/players";
}
