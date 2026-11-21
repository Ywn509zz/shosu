import { cached } from "./cache.server";
import type { Beatmapset, DiscoveryLens } from "./osu";
import { searchBeatmapsets, type SearchSort } from "./osu.server";

const PER_LENS = 18; // 3 pages de 6 suggestions
const LENSES: { id: string; title: string; sort: SearchSort }[] = [
  { id: "plays", title: "🔥 Les plus jouées", sort: "plays_desc" },
  { id: "recent", title: "🆕 Récemment classées", sort: "ranked_desc" },
  { id: "loved", title: "❤️ Les plus aimées", sort: "favourites_desc" },
];

/** Mélange de Fisher-Yates sur une copie. */
function shuffle<T>(list: readonly T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Les 40 premières beatmaps classées pour ce tri : mises en cache 10 min (le mélange, lui, est refait à chaque visite). */
function top(sort: SearchSort): Promise<Beatmapset[]> {
  return cached(`discover:${sort}`, 10 * 60_000, async () => {
    const page = await searchBeatmapsets({ q: "", status: "ranked", sort });
    return page.beatmapsets.filter((set) => set.previewFile).slice(0, 40);
  });
}

/**
 * Suggestions de la page d'accueil. Chaque visite tire une sélection différente parmi les meilleures
 * beatmaps de chaque tri, plus une rangée « Surprends-moi » piochée dans toutes les autres.
 * Une rangée indisponible est simplement omise : la recherche ne dépend jamais de ces suggestions.
 */
export async function getDiscovery(): Promise<DiscoveryLens[]> {
  const settled = await Promise.allSettled(LENSES.map((lens) => top(lens.sort)));

  const lenses: DiscoveryLens[] = [];
  const pool = new Map<number, Beatmapset>();
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled" || result.value.length === 0) return;
    const items = shuffle(result.value).slice(0, PER_LENS);
    lenses.push({ id: LENSES[index].id, title: LENSES[index].title, items });
    for (const set of result.value) pool.set(set.id, set);
  });

  if (lenses.length > 0) {
    lenses.push({ id: "surprise", title: "🎲 Surprends-moi", items: shuffle([...pool.values()]).slice(0, PER_LENS) });
  }
  return lenses;
}
