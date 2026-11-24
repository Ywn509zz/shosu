import { Link, useLocation } from "react-router";

import { ASSISTANT_LOGO, ASSISTANT_NAME } from "~/lib/assistant";
import type { SessionUser } from "~/lib/session.server";

/**
 * Barre de navigation du bas, réservée aux téléphones (affichée en CSS sous 700 px, voir mobile.css) :
 * cibles tactiles larges à portée du pouce, au lieu des petits boutons du header.
 */
export function MobileNav({
  user,
  assistantOpen,
  onToggleAssistant,
  onSearch,
}: {
  user: SessionUser | null;
  assistantOpen: boolean;
  onToggleAssistant: () => void;
  onSearch: () => void;
}) {
  const { pathname } = useLocation();
  const profile = user?.osuId ? `/player/${user.osuId}` : null;

  return (
    <nav className="mobile-nav" aria-label="Navigation principale">
      <Link
        to="/"
        className={pathname === "/" ? "is-active" : undefined}
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <span aria-hidden>🏠</span>
        Accueil
      </Link>
      <button type="button" onClick={onSearch}>
        <span aria-hidden>🔎</span>
        Recherche
      </button>
      <Link
        to="/lists"
        className={pathname.startsWith("/lists") || pathname.startsWith("/collection") ? "is-active" : undefined}
        aria-current={pathname.startsWith("/lists") ? "page" : undefined}
      >
        <span aria-hidden>📁</span>
        Listes
      </Link>
      <button
        type="button"
        className={assistantOpen ? "is-active" : undefined}
        aria-expanded={assistantOpen}
        aria-controls="assistant-panel"
        onClick={onToggleAssistant}
      >
        <img src={ASSISTANT_LOGO} alt="" width={24} height={24} />
        <span translate="no">{ASSISTANT_NAME}</span>
      </button>
      {profile ? (
        <Link to={profile} className={pathname.startsWith("/player") ? "is-active" : undefined}>
          <span aria-hidden>👤</span>
          Profil
        </Link>
      ) : (
        <a href="/api/auth/login">
          <span aria-hidden>👤</span>
          Connexion
        </a>
      )}
    </nav>
  );
}
