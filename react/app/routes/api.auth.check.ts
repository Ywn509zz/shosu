import { data } from "react-router";

import { osuBase, osuCredentials } from "~/lib/osu.server";

import type { Route } from "./+types/api.auth.check";

/**
 * Diagnostic de la configuration OAuth (équivalent de api/auth/check.js).
 * Ne divulgue aucun secret : tente un échange de code factice et renvoie la
 * réponse d'osu! pour savoir si l'application et l'URL de callback sont valides.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { clientId, clientSecret } = osuCredentials();
    const redirect =
      process.env.OSU_REDIRECT_URI || new URL("/api/auth/callback", request.url).toString();

    const response = await fetch(`${osuBase()}/oauth/token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: "verification-code-not-used",
        grant_type: "authorization_code",
        redirect_uri: redirect,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const details = (await response.json().catch(() => null)) as {
      error?: string;
      error_description?: string;
    } | null;

    return data(
      {
        clientConfigured: Boolean(clientId && clientSecret),
        clientIdLength: String(clientId).length,
        redirectUri: redirect,
        osuError: details?.error || null,
        osuErrorDescription: details?.error_description || null,
      },
      { headers },
    );
  } catch (error) {
    return data(
      {
        error: "Unable to test osu! OAuth configuration",
        detail: error instanceof Error ? error.message : null,
      },
      { status: 500, headers },
    );
  }
}
