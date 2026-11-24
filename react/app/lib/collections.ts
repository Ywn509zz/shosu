/** Collections personnalisées (listes nommées et partageables) : types partagés serveur + navigateur. */

export type Collection = {
  id: string;
  name: string;
  description: string;
  /** Vrai : toute personne qui a le lien peut la voir. */
  public: boolean;
  count: number;
  /** Id de la première beatmap (sert de couverture dans les vignettes et les aperçus de lien). */
  coverId: number | null;
  createdAt: number;
  updatedAt: number;
  ownerId: number;
  ownerName: string;
};

export const MAX_COLLECTION_NAME = 60;
export const MAX_COLLECTION_DESCRIPTION = 200;

/** Identifiant public d'une collection : 10 caractères tirés au hasard (le lien de partage). */
export const COLLECTION_ID_PATTERN = /^[a-hj-km-np-z2-9]{10}$/;

export const collectionPath = (id: string) => `/collection/${id}`;

/** Nettoie un nom saisi : sans caractères de contrôle, espaces compactés, longueur bornée. */
export function cleanName(value: unknown, max = MAX_COLLECTION_NAME): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
