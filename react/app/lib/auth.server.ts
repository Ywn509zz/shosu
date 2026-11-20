import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

import { osuBase, osuCredentials } from "./osu.server";

/**
 * Authentification — Better Auth, connexion via osu! (OAuth 2.0 + PKCE).
 *
 * Remplace l'ancien module maison (api/_auth.js). Aucune base de données :
 * Better Auth fonctionne en mode « stateless ». La session et l'état OAuth
 * (anti-CSRF + PKCE) sont portés par des cookies chiffrés (JWE), HttpOnly,
 * Secure et SameSite=Lax.
 *
 * Variables : mêmes noms que la version HTML/JS (CLIENT_ID, CLIENT_SECRET,
 * OSU_REDIRECT_URI, SESSION_SECRET). BETTER_AUTH_SECRET / BETTER_AUTH_URL sont
 * acceptées en alternative.
 *
 * Limite : une session ne peut pas être révoquée individuellement. Incrémenter
 * AUTH_SESSION_VERSION invalide toutes les sessions d'un coup.
 */

type OsuMe = {
  id: number;
  username: string;
  avatar_url?: string;
};

const redirectUri = process.env.OSU_REDIRECT_URI || undefined;

function baseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      /* ignoré : on retombe sur la détection automatique */
    }
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

const baseURL = baseUrl();
const { clientId, clientSecret } = osuCredentials();

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET,

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60, // 7 jours, comme avant
      strategy: "jwe",
      refreshCache: true,
      version: process.env.AUTH_SESSION_VERSION ?? "1",
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "osu",
          clientId,
          clientSecret,
          authorizationUrl: `${osuBase()}/oauth/authorize`,
          tokenUrl: `${osuBase()}/oauth/token`,
          // `identify` suffit pour lire /me ; rien de plus n'est demandé.
          scopes: ["identify"],
          pkce: true,
          // L'URL déjà enregistrée dans l'application osu! (…/api/auth/callback).
          // La route app/routes/api.auth.callback.ts la relaie vers Better Auth.
          redirectURI: redirectUri ?? (baseURL ? `${baseURL}/api/auth/callback` : undefined),
          async getUserInfo(tokens) {
            const response = await fetch(`${osuBase()}/api/v2/me`, {
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(8_000),
            });
            if (!response.ok) return null;

            const me = (await response.json()) as OsuMe;
            return {
              id: String(me.id),
              name: me.username,
              image: me.avatar_url,
              // osu! ne fournit pas d'e-mail ; Better Auth en exige un. On
              // utilise un identifiant non routable (TLD réservé .invalid),
              // jamais marqué comme vérifié.
              email: `${me.id}@users.osu.invalid`,
              emailVerified: false,
            };
          },
        },
      ],
    }),
  ],
});
