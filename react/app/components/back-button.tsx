import { Link, useLocation, useNavigate } from "react-router";

/**
 * Bouton « Retour » : revient à la page précédente de shOsu! quand il y en a une,
 * sinon (page ouverte directement depuis un lien) mène à l'accueil.
 * Sans JavaScript, c'est un simple lien vers l'accueil.
 */
export function BackButton() {
  const navigate = useNavigate();
  // Dans React Router, la première entrée d'historique de la session a la clé « default ».
  const hasPrevious = useLocation().key !== "default";

  return (
    <nav className="back-nav" aria-label="Navigation">
      <Link
        className="back-btn"
        to="/"
        onClick={(event) => {
          if (!hasPrevious || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          void navigate(-1);
        }}
      >
        <span aria-hidden="true">←</span> {hasPrevious ? "Retour" : "Accueil"}
      </Link>
    </nav>
  );
}
