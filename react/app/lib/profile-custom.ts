/**
 * Profil personnalisable (côté shOsu!) : biographie, couleur d'accent, bannière et collections en vedette.
 * Types, palettes et nettoyage partagés entre le serveur (validation) et le navigateur (éditeur, affichage).
 */

export const ACCENTS = [
  { id: "violet", label: "Violet", color: "#9c7cff" },
  { id: "rose", label: "Rose", color: "#ff63cf" },
  { id: "cyan", label: "Cyan", color: "#3cc8ff" },
  { id: "vert", label: "Vert", color: "#5fe39a" },
  { id: "orange", label: "Orange", color: "#ffa23c" },
  { id: "rouge", label: "Rouge", color: "#ff5c6c" },
] as const;

export const BANNERS = [
  { id: "aurora", label: "Aurore" },
  { id: "sunset", label: "Coucher de soleil" },
  { id: "ocean", label: "Océan" },
  { id: "forest", label: "Forêt" },
  { id: "midnight", label: "Minuit" },
  { id: "cherry", label: "Cerisier" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type BannerId = (typeof BANNERS)[number]["id"];

export const MAX_BIO = 200;
export const MAX_FEATURED = 3;

export type ProfileCustom = {
  bio: string;
  accent: AccentId;
  banner: BannerId;
  /** Identifiants de collections publiques du joueur mises en avant (3 au plus). */
  featured: string[];
};

export const DEFAULT_CUSTOM: ProfileCustom = { bio: "", accent: "violet", banner: "midnight", featured: [] };

export const isAccent = (value: unknown): value is AccentId => ACCENTS.some((a) => a.id === value);
export const isBanner = (value: unknown): value is BannerId => BANNERS.some((b) => b.id === value);

/** Biographie nettoyée : sans caractères de contrôle ni retours multiples, bornée. */
export function cleanBio(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim()
        .slice(0, MAX_BIO)
    : "";
}
