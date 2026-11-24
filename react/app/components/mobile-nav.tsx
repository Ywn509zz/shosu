import { Link, useLocation } from "react-router";

import { ASSISTANT_LOGO, ASSISTANT_NAME } from "~/lib/assistant";
import type { SessionUser } from "~/lib/session.server";

/** Icône de trait (24×24) pour la barre du bas : sobre, comme le reste du thème. */
function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

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
        <Icon d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" />
        Accueil
      </Link>
      <button type="button" onClick={onSearch}>
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3" />
        Recherche
      </button>
      <Link
        to="/lists"
        className={pathname.startsWith("/lists") || pathname.startsWith("/collection") ? "is-active" : undefined}
        aria-current={pathname.startsWith("/lists") ? "page" : undefined}
      >
        <Icon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
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
          <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-7 8-7s8 3 8 7" />
          Profil
        </Link>
      ) : (
        <a href="/api/auth/login">
          <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-7 8-7s8 3 8 7" />
          Connexion
        </a>
      )}
    </nav>
  );
}
