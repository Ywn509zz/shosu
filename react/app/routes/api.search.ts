import { data } from "react-router";

import { MODE_IDS, STATUS_IDS } from "~/lib/osu";
import { OsuError, searchBeatmapsets } from "~/lib/osu.server";

import type { Route } from "./+types/api.search";

const MAX_QUERY_LENGTH = 200;
const CURSOR_PATTERN = /^[A-Za-z0-9+/=_-]{1,1000}$/;
const headers = { "Cache-Control": "no-store", Allow: "GET" };

/**
 * Équivalent de l'ancien api/search.js : GET /api/search?q=…
 * Public (la recherche n'a jamais exigé de connexion) ; les identifiants osu!
 * ne quittent jamais le serveur.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length > MAX_QUERY_LENGTH) {
    return data({ error: "Query must be 1-200 characters" }, { status: 400, headers });
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
    });
    return data(page, { headers });
  } catch (err) {
    console.error("osu! search error:", err instanceof Error ? err.name : "Error");
    const rateLimited = err instanceof OsuError && err.status === 429;
    return data(
      { error: "osu! search temporarily unavailable" },
      { status: rateLimited ? 429 : 502, headers },
    );
  }
}
