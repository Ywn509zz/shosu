import type { ReactNode } from "react";

/**
 * État vide accueillant : une icône, un titre clair, une phrase qui explique pourquoi c'est vide et, surtout, **une action**
 * pour en sortir (lancer une recherche, importer ses favoris, créer une collection…). À utiliser à la place d'un simple texte « Aucun… ».
 */
export function EmptyState({
  icon = "◌",
  title,
  children,
  actions,
  tone = "neutral",
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** `error` : problème temporaire (osu! ne répond pas…) ; `neutral` : simplement rien à afficher. */
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`empty-state is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="empty-state-icon" aria-hidden>
        {icon}
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  );
}
