import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

const ERRORS: Record<string, string> = {
  access_denied: "Connexion annulée sur osu!.",
};

type Notice = { title: string; text: string };

/**
 * Bandeau affiché au retour d'osu! : `?login=success` (comme script.js) ou
 * `?error=…` (échec ou refus). L'URL est nettoyée aussitôt.
 */
export function LoginNotice() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);

  const login = params.get("login");
  const error = params.get("error");

  useEffect(() => {
    if (login !== "success" && !error) return;

    setNotice(
      login === "success"
        ? { title: "Vous êtes connecté à osu!", text: "Redirection vers shOsu!..." }
        : { title: "Connexion impossible", text: ERRORS[error ?? ""] ?? "Veuillez réessayer." },
    );

    // Le nettoyage de l'URL change les paramètres et relance cet effet : le minuteur de masquage
    // vit donc dans son propre effet, sinon il serait annulé avant d'avoir sonné.
    const clean = new URL(window.location.href);
    clean.searchParams.delete("login");
    clean.searchParams.delete("error");
    void navigate(clean.pathname + clean.search, { replace: true });
  }, [login, error, navigate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="login-notice" role="status">
      <strong>{notice.title}</strong>
      <span>{notice.text}</span>
    </div>
  );
}
