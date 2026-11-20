import { timingSafeEqual } from "node:crypto";

import { data } from "react-router";

import { osuBase, osuCredentials } from "~/lib/osu.server";

import type { Route } from "./+types/api.auth.check";

/**
 * Diagnostic de la configuration OAuth (équivalent de api/auth/check.js).
 * Tente un échange de code factice avec le secret de l'application et renvoie
 * la réponse d'osu! pour savoir si l'application et l'URL de callback sont valides.
 *
 * Contrairement à l'ancienne version, il n'est PAS public : chaque appel utilise
 * le secret osu!, donc un appel anonyme répété pourrait faire bloquer l'application.
 * Il n'existe que si DIAGNOSTICS_TOKEN (16 caractères min.) est défini, et exige
 * `Authorization: Bearer <DIAGNOSTICS_TOKEN>` ; sinon 404, comme s'il n'existait pas.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.DIAGNOSTICS_TOKEN;
  if (!expected || expected.length < 16) return false;

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = { "Cache-Control": "no-store" };
  if (!isAuthorized(request)) throw data(null, { status: 404 });

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
  } catch {
    // Pas de détail interne dans la réponse.
    return data({ error: "Unable to test osu! OAuth configuration" }, { status: 500, headers });
  }
}
