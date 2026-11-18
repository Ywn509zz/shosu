import { randomBytes } from "node:crypto";
import {
  STATE_COOKIE,
  cookieOptions,
  oauthConfig,
  redirectUri,
} from "../_auth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method not allowed");
  }

  try {
    const { clientId } = oauthConfig();
    const state = randomBytes(32).toString("base64url");
    const authorizeUrl = new URL("https://osu.ppy.sh/oauth/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(req),
      response_type: "code",
      scope: "public identify",
      state,
    });

    res.setHeader(
      "Set-Cookie",
      `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(600)}`,
    );
    return res.redirect(302, authorizeUrl.toString());
  } catch (error) {
    console.error("osu! login setup error:", error?.message || "Unknown error");
    return res.status(500).json({ error: "Login is not configured" });
  }
}
