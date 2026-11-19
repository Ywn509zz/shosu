import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { authClient } from "~/lib/auth-client";
import type { SessionUser } from "~/lib/session.server";

/** Zone de compte du header : lien de connexion, ou menu une fois connecté. */
export function Account({ user }: { user: SessionUser | null }) {
  return (
    <div id="account" className="account" aria-live="polite">
      {user ? (
        <AccountMenu user={user} />
      ) : (
        <a className="account-btn" href="/api/auth/login">
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
        <span className="account-chevron">⌄</span>
      </Button>

      <div className="account-dropdown" id="account-dropdown" hidden={!open}>
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
