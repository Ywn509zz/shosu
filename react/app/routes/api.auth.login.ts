import { auth } from "~/lib/auth.server";

import type { Route } from "./+types/api.auth.login";

/**
 * GET /api/auth/login[?switch=1] — même URL que la version HTML/JS.
 * Démarre la connexion Better Auth et redirige vers osu!. Avec `switch=1`,
 * `prompt=login` est ajouté pour proposer un autre compte osu!.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const switchAccount = new URL(request.url).searchParams.get("switch") === "1";

  const response = await auth.api.signInSocial({
    body: {
      provider: "osu",
      callbackURL: "/?login=success",
      errorCallbackURL: "/",
      disableRedirect: true,
    },
    headers: request.headers,
    asResponse: true,
  });

  const { url } = (await response.json()) as { url?: string };
  if (!url) return new Response("Login is not configured", { status: 500 });

  const authorizeUrl = new URL(url);
  if (switchAccount) authorizeUrl.searchParams.set("prompt", "login");

  // Les cookies d'état OAuth / PKCE posés par Better Auth doivent suivre la redirection.
  const headers = new Headers({
    Location: authorizeUrl.toString(),
    "Cache-Control": "no-store",
  });
  for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);

  return new Response(null, { status: 302, headers });
}
