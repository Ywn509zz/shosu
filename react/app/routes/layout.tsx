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

/** Liens de la barre de navigation (affichée au-dessus de 700 px, liens secondaires masqués sous 1000 px ; sur téléphone, la barre du bas prend le relais). */
const NAV: { to: string; label: string; signedIn?: boolean; extra?: boolean }[] = [
  { to: "/", label: "Découvrir" },
  { to: "/collections", label: "Collections" },
  { to: "/dna", label: "Music DNA", signedIn: true, extra: true },
  { to: "/compare", label: "Comparer", extra: true },
  { to: "/lists", label: "Listes", signedIn: true },
  { to: "/stats", label: "Statistiques", signedIn: true, extra: true },
];
const isActive = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

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

  // Relevé quotidien des statistiques du joueur connecté (une fois par jour, par navigateur) : c'est ce qui construit les
  // courbes de pp et de précision de « Suivi de progression » (osu! ne fournit pas cet historique).
  useEffect(() => {
    if (!user?.osuId) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `shosu-snapshot:${user.osuId}`;
    try {
      if (localStorage.getItem(key) === day) return;
    } catch {
      return;
    }
    fetch("/api/progress", { method: "POST", headers: { Accept: "application/json" } })
      .then((response) => {
        if (response.ok) {
          try {
            localStorage.setItem(key, day);
          } catch {
            /* ignoré */
          }
        }
      })
      .catch(() => {});
  }, [user?.osuId]);

  return (
    <AssistantContext.Provider value={assistantApi}>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/" aria-label="Retour à l'accueil">
            <img className="brand-mark" src="/icon.svg" alt="" width={40} height={40} />
            <span translate="no">shOsu!</span>
          </Link>
          <nav className="site-nav" aria-label="Navigation principale">
            {NAV.filter((item) => !item.signedIn || user).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={[isActive(pathname, item.to) ? "is-active" : "", item.extra ? "nav-extra" : ""].filter(Boolean).join(" ") || undefined}
                aria-current={isActive(pathname, item.to) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Account user={user} assistantOpen={assistantOpen} onToggleAssistant={toggleAssistant} />
        </div>
      </header>

      <div className="page-shell">

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
