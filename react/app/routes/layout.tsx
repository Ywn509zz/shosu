import { Link, Outlet } from "react-router";

import { Account } from "~/components/account";
import { LoginNotice } from "~/components/login-notice";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await getUser(request) };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="page-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Retour à l'accueil">
          <span className="brand-mark">s</span>
          <span translate="no">shOsu!</span>
        </Link>
        <Account user={loaderData.user} />
      </header>

      <main>
        <Outlet />
      </main>

      <footer id="version-info" translate="no">
        shOsu! · bêta 1.5
      </footer>

      <LoginNotice />
    </div>
  );
}
