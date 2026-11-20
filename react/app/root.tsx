import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const meta: Route.MetaFunction = () => [{ title: "shOsu!" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Une erreur est survenue";
  let details = "Une erreur inattendue s'est produite.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page introuvable" : `Erreur ${error.status}`;
    details =
      error.status === 404
        ? "La page que vous cherchez n'existe pas."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div className="page-shell">
      <main>
        <section className="hero">
          <p className="eyebrow">SHOSU!</p>
          <h1>{title}</h1>
          <p className="hero-copy">{details}</p>
          <Link className="account-btn" to="/">
            Retour à l'accueil
          </Link>
          {stack && (
            <pre style={{ textAlign: "left", overflowX: "auto", color: "var(--muted)" }}>
              <code>{stack}</code>
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
