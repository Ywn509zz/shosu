import { SESSION_COOKIE, decryptSession, getCookie } from "../_auth.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method not allowed");
  }

  const sessionCookie = getCookie(req, SESSION_COOKIE);
  const session = sessionCookie ? decryptSession(sessionCookie) : null;
  if (!session) return res.status(401).json({ authenticated: false });

  return res.status(200).json({
    authenticated: true,
    user: session.user,
    plan: session.plan,
  });
}
