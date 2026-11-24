/**
 * Filtres avancés de la recherche : étoiles, BPM, durée, tri. Module partagé (navigateur : formulaire et lien profond ;
 * serveur : validation, puis ajout à la requête osu!).
 *
 * osu! comprend la syntaxe `stars>=5 stars<=6 bpm>=180 length<=180` dans le texte de la recherche (vérifié sur l'API) :
 * les filtres sont donc appliqués **côté osu!**, avant la pagination ; le navigateur re-contrôle les plages d'étoiles et de BPM
 * (`matchesRange`) comme filet de sécurité.
 */

export const SORTS = [
  { id: "relevance", label: "Pertinence" },
  { id: "plays_desc", label: "Les plus jouées" },
  { id: "ranked_desc", label: "Les plus récentes" },
  { id: "favourites_desc", label: "Les plus aimées" },
  { id: "updated_desc", label: "Mises à jour récemment" },
  { id: "rating_desc", label: "Les mieux notées" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export type SearchFilters = {
  starsMin?: number;
  starsMax?: number;
  bpmMin?: number;
  bpmMax?: number;
  /** Durée maximale en secondes. */
  lengthMax?: number;
  sort?: Exclude<SortId, "relevance">;
};

/** Noms des paramètres d'URL (lien profond `/?q=…&smin=5&bmin=180`). */
export const FILTER_PARAMS = {
  starsMin: "smin",
  starsMax: "smax",
  bpmMin: "bmin",
  bpmMax: "bmax",
  lengthMax: "lmax",
  sort: "sort",
} as const;

const bounded = (value: string | null | undefined, min: number, max: number, digits: number): number | undefined => {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return Math.round(n * 10 ** digits) / 10 ** digits;
};

/** Lit et VALIDE les filtres (valeurs hors bornes ignorées, plage inversée corrigée). */
export function parseFilters(get: (name: string) => string | null | undefined): SearchFilters {
  const f: SearchFilters = {
    starsMin: bounded(get(FILTER_PARAMS.starsMin), 0, 15, 1),
    starsMax: bounded(get(FILTER_PARAMS.starsMax), 0, 15, 1),
    bpmMin: bounded(get(FILTER_PARAMS.bpmMin), 20, 1000, 0),
    bpmMax: bounded(get(FILTER_PARAMS.bpmMax), 20, 1000, 0),
    lengthMax: bounded(get(FILTER_PARAMS.lengthMax), 10, 3600, 0),
  };
  const sort = get(FILTER_PARAMS.sort);
  if (sort && SORTS.some((s) => s.id === sort && s.id !== "relevance")) f.sort = sort as SearchFilters["sort"];
  if (f.starsMin !== undefined && f.starsMax !== undefined && f.starsMin > f.starsMax)
    [f.starsMin, f.starsMax] = [f.starsMax, f.starsMin];
  if (f.bpmMin !== undefined && f.bpmMax !== undefined && f.bpmMin > f.bpmMax)
    [f.bpmMin, f.bpmMax] = [f.bpmMax, f.bpmMin];
  for (const key of Object.keys(f) as (keyof SearchFilters)[]) if (f[key] === undefined) delete f[key];
  return f;
}

/** Fragment de requête osu! (commence par une espace) : « stars>=5 stars<=6 bpm>=180 length<=180 ». */
export function filtersToQuery(f: SearchFilters): string {
  const parts: string[] = [];
  if (f.starsMin !== undefined) parts.push(`stars>=${f.starsMin}`);
  if (f.starsMax !== undefined) parts.push(`stars<=${f.starsMax}`);
  if (f.bpmMin !== undefined) parts.push(`bpm>=${f.bpmMin}`);
  if (f.bpmMax !== undefined) parts.push(`bpm<=${f.bpmMax}`);
  if (f.lengthMax !== undefined) parts.push(`length<=${f.lengthMax}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function filtersToParams(f: SearchFilters, params: URLSearchParams): void {
  for (const [key, name] of Object.entries(FILTER_PARAMS) as [keyof SearchFilters, string][]) {
    if (f[key] !== undefined) params.set(name, String(f[key]));
  }
}

export const hasFilters = (f: SearchFilters) => Object.keys(f).length > 0;
/** Nombre de filtres actifs (hors tri), pour le badge du bouton. */
export const activeFilterCount = (f: SearchFilters) =>
  Object.keys(f).filter((k) => k !== "sort").length + (f.sort ? 1 : 0);

/** Filet de sécurité côté navigateur : la plage d'étoiles du set recoupe la plage demandée, et le BPM est dans la plage. */
export function matchesRange(
  set: { minStars: number | null; maxStars: number | null; bpm?: number | null },
  f: SearchFilters,
): boolean {
  if (f.starsMin !== undefined && set.maxStars !== null && set.maxStars < f.starsMin) return false;
  if (f.starsMax !== undefined && set.minStars !== null && set.minStars > f.starsMax) return false;
  if (set.bpm !== null && set.bpm !== undefined) {
    if (f.bpmMin !== undefined && set.bpm < f.bpmMin) return false;
    if (f.bpmMax !== undefined && set.bpm > f.bpmMax) return false;
  }
  return true;
}
