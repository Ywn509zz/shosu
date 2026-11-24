import { data } from "react-router";

import { MODE_IDS, STATUS_IDS } from "~/lib/osu";
import { filtersToQuery, hasFilters, parseFilters } from "~/lib/search-filters";
import { OsuError, searchBeatmapsets } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";

import type { Route } from "./+types/api.search";

const MAX_QUERY_LENGTH = 200;
const CURSOR_PATTERN = /^[A-Za-z0-9+/=_-]{1,1000}$/;
const headers = { "Cache-Control": "no-store", Allow: "GET" };
/**
 * Résultat public (aucune donnée propre à un utilisateur) : le CDN de Vercel peut le garder
 * 60 s et le resservir pendant 5 min en actualisant en arrière-plan. Les requêtes servies
 * par le CDN n'atteignent pas la fonction : elles ne comptent pas dans la limite ci-dessous.
 */
const cacheableHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  Allow: "GET",
};

/** 90 recherches par minute et par adresse IP (protège le quota osu! partagé). */
const IP_LIMIT = { limit: 90, windowMs: 60_000 };

/**
 * Équivalent de l'ancien api/search.js : GET /api/search?q=…
 * Public (la recherche n'a jamais exigé de connexion) ; les identifiants osu!
 * ne quittent jamais le serveur.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const text = (url.searchParams.get("q") ?? "").trim();
  // Filtres avancés (étoiles, BPM, durée) et tri : validés, puis traduits en syntaxe osu! ; sans texte, un filtre suffit.
  const filters = parseFilters((name) => url.searchParams.get(name));
  if (text.length > MAX_QUERY_LENGTH || (!text && !hasFilters(filters))) {
    return data({ error: "Query must be 1-200 characters" }, { status: 400, headers });
  }
  const q = `${text}${filtersToQuery(filters)}`.trim();

  const hit = await rateLimit(`search:${clientIp(request)}`, IP_LIMIT.limit, IP_LIMIT.windowMs, false);
  if (!hit.ok) {
    return data(
      { error: "Too many searches" },
      { status: 429, headers: { ...headers, "Retry-After": String(hit.retryAfterSeconds) } },
    );
  }

  const mode = url.searchParams.get("mode") ?? "all";
  const status = url.searchParams.get("status") ?? "all";
  const rawCursor = url.searchParams.get("cursor");

  try {
    const page = await searchBeatmapsets({
      q,
      mode: MODE_IDS.includes(mode) ? mode : "all",
      status: STATUS_IDS.includes(status) ? status : "all",
      cursor: rawCursor && CURSOR_PATTERN.test(rawCursor) ? rawCursor : null,
      sort: filters.sort,
    });
    return data(page, { headers: cacheableHeaders });
  } catch (err) {
    console.error("osu! search error:", err instanceof Error ? err.name : "Error");
    const rateLimited = err instanceof OsuError && err.status === 429;
    return data(
      { error: "osu! search temporarily unavailable" },
      { status: rateLimited ? 429 : 502, headers },
    );
  }
}
