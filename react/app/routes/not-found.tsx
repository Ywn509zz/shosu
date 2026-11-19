import { data } from "react-router";

// Une vraie réponse 404 (et non une page « vide » en 200) : le rendu est celui
// de l'ErrorBoundary racine.
export function loader() {
  throw data(null, { status: 404 });
}

export default function NotFound() {
  return null;
}
