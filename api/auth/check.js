import { oauthConfig, redirectUri } from "../_auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { clientId, clientSecret } = oauthConfig();
    const redirect = redirectUri(req);
    const response = await fetch("https://osu.ppy.sh/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: "verification-code-not-used",
        grant_type: "authorization_code",
        redirect_uri: redirect,
      }),
    });
    const details = await response.json().catch(() => null);

    return res.status(200).json({
      clientConfigured: Boolean(clientId && clientSecret),
      clientIdLength: String(clientId).length,
      redirectUri: redirect,
      osuError: details?.error || null,
      osuErrorDescription: details?.error_description || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to test osu! OAuth configuration",
      detail: error?.message || null,
    });
  }
}
