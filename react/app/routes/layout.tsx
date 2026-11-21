import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router";

import { Account } from "~/components/account";
import { Assistant } from "~/components/assistant";
import { LoginNotice } from "~/components/login-notice";
import { PlayerBar } from "~/components/player-bar";
import { AssistantContext } from "~/lib/assistant-context";
import { ListsProvider, useLists } from "~/lib/lists-context";
import { APP_VERSION } from "~/lib/config";
import { PlayerProvider, usePlayer } from "~/lib/player";
import { getUser, type SessionUser } from "~/lib/session.server";
import { useShortcuts } from "~/lib/use-shortcuts";

import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await getUser(request) };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  return (
    <PlayerProvider>
      <ListsProvider signedIn={loaderData.user !== null}>
        <Shell user={loaderData.user} />
      </ListsProvider>
    </PlayerProvider>
  );
}

/** Message d'erreur des listes (liste pleine, réseau…), affiché 4 s dans le style du bandeau de connexion. */
function ListsToast() {
  const { error, clearError } = useLists();

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(clearError, 4500);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div className="login-notice" role="status">
      <strong>Listes</strong>
      <span>{error}</span>
    </div>
  );
}

function Shell({ user }: { user: SessionUser | null }) {
  const navigate = useNavigate();
  const player = usePlayer();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);

  const toggleAssistant = useCallback(() => setAssistantOpen((open) => !open), []);
  const assistantApi = useMemo(
    () => ({
      ask: (text: string) => {
        setPendingAsk(text);
        setAssistantOpen(true);
      },
    }),
    [],
  );

  const focusSearch = useCallback(() => {
    const field = document.getElementById("songName") as HTMLInputElement | null;
    if (field) {
      field.focus();
      field.select();
      return;
    }
    // Pas sur l'accueil : on y va, puis on place le curseur dans le champ.
    void navigate("/");
    window.setTimeout(() => document.getElementById("songName")?.focus(), 150);
  }, [navigate]);

  useShortcuts({ focusSearch, toggleAssistant, player });

  return (
    <AssistantContext.Provider value={assistantApi}>
      <div className="page-shell">
        <header className="site-header">
          <Link className="brand" to="/" aria-label="Retour à l'accueil">
            <span className="brand-mark">s</span>
            <span translate="no">shOsu!</span>
          </Link>
          <Account user={user} assistantOpen={assistantOpen} onToggleAssistant={toggleAssistant} />
        </header>

        <main>
          <Outlet />
        </main>

        <footer id="version-info" translate="no">
          shOsu! · {APP_VERSION}
        </footer>

        <LoginNotice />
        <ListsToast />
        <PlayerBar />
        <Assistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          signedIn={user !== null}
          pendingAsk={pendingAsk}
          onAskConsumed={() => setPendingAsk(null)}
        />
      </div>
    </AssistantContext.Provider>
  );
}
