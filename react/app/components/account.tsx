import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { ASSISTANT_LOGO, ASSISTANT_NAME } from "~/lib/assistant";
import { authClient } from "~/lib/auth-client";
import { PLANS } from "~/lib/plans";
import { ThemeToggle } from "~/components/theme-toggle";
import type { SessionUser } from "~/lib/session.server";

/** Zone de compte du header : lien de connexion, ou menu une fois connecté. */
export function Account({
  user,
  assistantOpen,
  onToggleAssistant,
}: {
  user: SessionUser | null;
  assistantOpen: boolean;
  onToggleAssistant: () => void;
}) {
  return (
    <div id="account" className="account">
      <ThemeToggle />
      <Button
        id="assistant-toggle"
        className="assistant-toggle"
        aria-expanded={assistantOpen}
        aria-controls="assistant-panel"
        aria-keyshortcuts="S"
        onPress={onToggleAssistant}
      >
        <img src={ASSISTANT_LOGO} alt="" width={26} height={26} />
        <span translate="no">{ASSISTANT_NAME}</span>
      </Button>
      {user ? (
        <AccountMenu user={user} />
      ) : (
        <a className="account-btn is-primary" href="/api/auth/login">
          Se connecter avec osu!
        </a>
      )}
    </div>
  );
}

function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur (comme avant) et à la touche Échap (en plus).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logoutAndRedirect(forceSwitch: boolean) {
    const { error } = await authClient.signOut();
    if (error) return;
    window.location.assign(forceSwitch ? "/api/auth/login?switch=1" : "/");
  }

  return (
    <div className="account-menu" ref={wrapperRef}>
      <Button
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-controls="account-dropdown"
        onPress={() => setOpen((value) => !value)}
      >
        <span className="account-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <span>{user.name}</span>
        {user.plan === "premium" && (
          <span className="plan-badge" title="Plan Premium">
            ✦ Premium
          </span>
        )}
        <span className="account-chevron">⌄</span>
      </Button>

      <div className="account-dropdown" id="account-dropdown" hidden={!open}>
        <Link to="/premium" onClick={() => setOpen(false)}>
          <span>Mon plan : {PLANS[user.plan].label}</span>
          <small>{user.plan === "premium" ? "Voir mes avantages" : "Voir les formules"}</small>
        </Link>
        {user.osuId && (
          <Link to={`/player/${user.osuId}`} onClick={() => setOpen(false)}>
            <span>Mon profil</span>
            <small>Statistiques et meilleurs scores</small>
          </Link>
        )}
        <Link to="/stats" onClick={() => setOpen(false)}>
          <span>Mes statistiques</span>
          <small>Progression et points faibles</small>
        </Link>
        <Link to="/collections" onClick={() => setOpen(false)}>
          <span>Collections publiques</span>
          <small>Découvrir celles des autres joueurs</small>
        </Link>
        <Link to="/dna" onClick={() => setOpen(false)}>
          <span>Music DNA</span>
          <small>Ton empreinte musicale</small>
        </Link>
        <Link to="/history" onClick={() => setOpen(false)}>
          <span>Historique</span>
          <small>Recherches et écoutes récentes</small>
        </Link>
        <Button type="button" onPress={() => logoutAndRedirect(false)}>
          <span>Déconnexion</span>
          <small>Quitter shOsu!</small>
        </Button>
        <Button type="button" onPress={() => logoutAndRedirect(true)}>
          <span>Changer de compte osu!</span>
          <small>Utiliser un autre profil</small>
        </Button>
      </div>
    </div>
  );
}
