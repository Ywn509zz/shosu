import { SESSION_COOKIE, clearCookie } from "../_auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method not allowed");
  }

  res.setHeader("Set-Cookie", clearCookie(SESSION_COOKIE));
  return res.status(204).end();
}
