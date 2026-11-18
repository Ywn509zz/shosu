import {
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  cookieOptions,
  encryptSession,
  getCookie,
  oauthConfig,
  redirectUri,
  validState,
} from "../_auth.js";

async function exchangeCode(code, req) {
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(req),
    }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(
      `osu! token exchange HTTP ${response.status}: ${details?.error || "unknown error"}`,
    );
  }
  return response.json();
}

async function fetchUser(accessToken) {
  const response = await fetch("https://osu.ppy.sh/api/v2/me", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`osu! profile request HTTP ${response.status}`);
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method not allowed");
  }

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!validState(getCookie(req, STATE_COOKIE), state) || !code) {
    res.setHeader("Set-Cookie", clearCookie(STATE_COOKIE));
    return res.status(400).json({ error: "Invalid OAuth state" });
  }

  try {
    const token = await exchangeCode(code, req);
    if (!token.access_token) throw new Error("osu! token response has no access token");
    const user = await fetchUser(token.access_token);
    const session = encryptSession({
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatar_url || null,
      },
      plan: "free",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    res.setHeader("Set-Cookie", [
      `${SESSION_COOKIE}=${encodeURIComponent(session)}; ${cookieOptions(604800)}`,
      clearCookie(STATE_COOKIE),
    ]);
    return res.redirect(302, "/?login=success");
  } catch (error) {
    console.error("osu! login callback error:", error?.message || "Unknown error");
    res.setHeader("Set-Cookie", clearCookie(STATE_COOKIE));
    return res.status(502).json({ error: "Unable to complete osu! login" });
  }
}
