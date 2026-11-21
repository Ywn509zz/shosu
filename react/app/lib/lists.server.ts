import { isListId, LIST_IDS, type ListId, type ListItem } from "./lists";
import type { Beatmapset } from "./osu";
import { getBeatmapset } from "./osu.server";
import { hash } from "./store.server";

export class ListFullError extends Error {}

const keyFor = (osuId: number, list: ListId) => `shosu:u:${osuId}:${list}`;

/** Ne garde que les champs attendus d'une entrée relue depuis la base. */
function parseItem(raw: string): ListItem | null {
  try {
    const v = JSON.parse(raw) as Partial<ListItem>;
    if (typeof v.id !== "number" || typeof v.title !== "string") return null;
    return {
      id: v.id,
      title: v.title,
      artist: String(v.artist ?? ""),
      creator: String(v.creator ?? ""),
      status: String(v.status ?? ""),
      modes: Array.isArray(v.modes) ? v.modes.map(String) : [],
      stars: typeof v.stars === "number" ? v.stars : null,
      minStars: typeof v.minStars === "number" ? v.minStars : null,
      maxStars: typeof v.maxStars === "number" ? v.maxStars : null,
      previewFile: typeof v.previewFile === "string" ? v.previewFile : null,
      addedAt: typeof v.addedAt === "number" ? v.addedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Contenu d'une liste, du plus récent au plus ancien. */
export async function getListItems(osuId: number, list: ListId): Promise<ListItem[]> {
  const all = await hash.getAll(keyFor(osuId, list));
  return Object.values(all)
    .map(parseItem)
    .filter((item): item is ListItem => item !== null)
    .sort((a, b) => b.addedAt - a.addedAt);
}

/** Identifiants présents dans chaque liste (léger : sert à colorer les boutons). */
export async function getListIds(osuId: number): Promise<Record<ListId, number[]>> {
  const entries = await Promise.all(
    LIST_IDS.map(async (list) => {
      const all = await hash.getAll(keyFor(osuId, list));
      return [list, Object.keys(all).map(Number).filter(Number.isInteger)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ListId, number[]>;
}

/**
 * Ajoute une beatmap (`limit` : taille maximale de la liste, selon le plan du joueur). Les métadonnées
 * viennent d'osu!, jamais du navigateur : un client ne peut pas faire stocker du texte de son choix.
 */
export async function addToList(osuId: number, list: ListId, beatmapsetId: number, limit: number): Promise<Beatmapset> {
  const key = keyFor(osuId, list);
  // Une beatmap déjà présente peut toujours être « réajoutée » ; sinon la liste ne doit pas être pleine.
  if (!(await hash.has(key, String(beatmapsetId))) && (await hash.length(key)) >= limit) {
    throw new ListFullError();
  }

  const detail = await getBeatmapset(beatmapsetId);
  const slim: Beatmapset = {
    id: detail.id,
    title: detail.title,
    artist: detail.artist,
    creator: detail.creator,
    status: detail.status,
    modes: detail.modes,
    stars: detail.stars,
    minStars: detail.minStars,
    maxStars: detail.maxStars,
    previewFile: detail.previewFile,
  };
  await hash.set(key, String(beatmapsetId), JSON.stringify({ ...slim, addedAt: Date.now() }));
  return slim;
}

export async function removeFromList(osuId: number, list: ListId, beatmapsetId: number): Promise<void> {
  await hash.remove(keyFor(osuId, list), String(beatmapsetId));
}

export { isListId };
