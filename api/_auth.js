import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "shosu_session";
export const STATE_COOKIE = "shosu_oauth_state";

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  return createHash("sha256").update(secret).digest();
}

export function cookieOptions(maxAge, extra = "") {
  return [
    `Path=/`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    extra,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCookie(name) {
  return `${name}=; ${cookieOptions(0)}`;
}

export function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const value = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

export function encryptSession(session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptSession(value) {
  try {
    const data = Buffer.from(value, "base64url");
    if (data.length < 29) return null;

    const decipher = createDecipheriv("aes-256-gcm", secretKey(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const decrypted = Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]);
    const session = JSON.parse(decrypted.toString("utf8"));
    if (!session.user || typeof session.user.id !== "number") return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function validState(expected, actual) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function redirectUri(req) {
  if (process.env.OSU_REDIRECT_URI) return process.env.OSU_REDIRECT_URI;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("Unable to determine OAuth redirect URI");
  return `${protocol}://${host}/api/auth/callback`;
}

export function oauthConfig() {
  const clientId = process.env.CLIENT_ID || process.env.OSU_CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET || process.env.OSU_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing osu! OAuth credentials");
  }
  return { clientId, clientSecret };
}
