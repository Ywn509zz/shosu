import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";

export const streamTimeout = 5_000;

/**
 * En-têtes de sécurité appliqués à chaque page HTML.
 * La CSP repose sur un nonce généré à chaque requête : seuls les scripts
 * émis par React Router sont exécutés. Elle est désactivée en dev car le
 * HMR de Vite injecte des scripts inline.
 */
function applySecurityHeaders(headers: Headers, nonce: string) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  // Le micro est nécessaire à la recherche vocale ; le reste est coupé.
  headers.set(
    "Permissions-Policy",
    "microphone=(self), camera=(), geolocation=(), payment=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (import.meta.env.PROD) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        // React Aria / HeroUI positionnent des styles inline (popovers).
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://assets.ppy.sh https://a.ppy.sh",
        "media-src https://b.ppy.sh",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  }
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  const nonce = randomBytes(16).toString("base64");
  applySecurityHeaders(responseHeaders, nonce);

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // Les robots attendent le rendu complet (SEO, aperçus de liens).
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
