import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { Account } from "~/components/account";
import { Assistant } from "~/components/assistant";
import { BackButton } from "~/components/back-button";
import { LoginNotice } from "~/components/login-notice";
import { MobileNav } from "~/components/mobile-nav";
import { PlayerBar } from "~/components/player-bar";
import { AssistantContext } from "~/lib/assistant-context";
import { HistoryProvider } from "~/lib/history";
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
        <HistoryProvider userKey={loaderData.user?.osuId ? String(loaderData.user.osuId) : "guest"}>
          <Shell user={loaderData.user} />
        </HistoryProvider>
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
  const { pathname } = useLocation();
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
            <img className="brand-mark" src="/icon.svg" alt="" width={40} height={40} />
            <span translate="no">shOsu!</span>
          </Link>
          <Account user={user} assistantOpen={assistantOpen} onToggleAssistant={toggleAssistant} />
        </header>

        {/* Le changement de page rejoue l'animation d'entrée (voir .page-enter dans motion.css). */}
        <main key={pathname} className="page-enter">
          {pathname !== "/" && <BackButton />}
          <Outlet />
        </main>

        <footer id="version-info" translate="no">
          shOsu! · {APP_VERSION}
        </footer>

        <MobileNav user={user} assistantOpen={assistantOpen} onToggleAssistant={toggleAssistant} onSearch={focusSearch} />
        <LoginNotice />
        <ListsToast />
        <PlayerBar />
        <Assistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          signedIn={user !== null}
          plan={user?.plan}
          pendingAsk={pendingAsk}
          onAskConsumed={() => setPendingAsk(null)}
        />
      </div>
    </AssistantContext.Provider>
  );
}
