import { auth } from "~/lib/auth.server";

import type { Route } from "./+types/api.auth.callback";

/**
 * L'application osu! a déjà `…/api/auth/callback` comme URL de callback.
 * Better Auth attend `…/api/auth/callback/osu` : on relaie la requête telle
 * quelle, ce qui évite de modifier l'application osu!.
 */
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  url.pathname = "/api/auth/callback/osu";
  return auth.handler(new Request(url, request));
}
