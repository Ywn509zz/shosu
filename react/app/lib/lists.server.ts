import { isListId, LIST_IDS, type ListId, type ListItem } from "./lists";
import type { Beatmapset } from "./osu";
import { getBeatmapset, osuGet, toBeatmapset, type RawBeatmapset } from "./osu.server";
import { hash } from "./store.server";

export class ListFullError extends Error {}

const keyFor = (osuId: number, list: ListId) => `shosu:u:${osuId}:${list}`;

/** Ne garde que les champs attendus d'une entrée relue depuis la base. */
export function parseItem(raw: string): ListItem | null {
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

/** Version allégée d'une beatmap, lue chez osu! (jamais fournie par le navigateur). */
export async function fetchSlim(beatmapsetId: number): Promise<Beatmapset> {
  const detail = await getBeatmapset(beatmapsetId);
  return {
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
}

/**
 * Ajoute une beatmap (`limit' : taille maximale de la liste, selon le plan du joueur). Les métadonnées
 * viennent d'osu!, jamais du navigateur : un client ne peut pas faire stocker du texte de son choix.
 */
export async function addToList(osuId: number, list: ListId, beatmapsetId: number, limit: number): Promise<Beatmapset> {
  const key = keyFor(osuId, list);
  // Une beatmap déjà présente peut toujours être « réajoutée » ; sinon la liste ne doit pas être pleine.
  if (!(await hash.has(key, String(beatmapsetId))) && (await hash.length(key)) >= limit) {
    throw new ListFullError();
  }

  const slim = await fetchSlim(beatmapsetId);
  await hash.set(key, String(beatmapsetId), JSON.stringify({ ...slim, addedAt: Date.now() }));
  return slim;
}

export async function removeFromList(osuId: number, list: ListId, beatmapsetId: number): Promise<void> {
  await hash.remove(keyFor(osuId, list), String(beatmapsetId));
}

export { isListId };

/** Supprime les deux listes du joueur (favoris, à jouer plus tard) : « Supprimer mes données ». */
export async function clearLists(osuId: number): Promise<void> {
  await Promise.all(LIST_IDS.map((list) => hash.del(keyFor(osuId, list))));
}

export type ImportResult = {
  /** Favoris lus chez osu!. */
  fetched: number;
  added: number;
  alreadyThere: number;
  /** Non ajoutés parce que la liste est pleine (limite du plan). */
  skippedByLimit: number;
};

const IMPORT_PAGE = 50;
const IMPORT_MAX_PAGES = 20; // 1 000 favoris au plus par import

/**
 * « Importer mes favoris osu! » : copie les beatmaps que le joueur a mises en favori sur osu.ppy.sh dans sa liste « favorites »
 * (jusqu'à `limit`). Les beatmaps déjà présentes sont ignorées ; la liste d'origine chez osu! n'est jamais modifiée.
 * Les métadonnées viennent d'osu! (jamais du navigateur) et sont écrites en une seule requête par paquet.
 */
export async function importOsuFavourites(osuId: number, limit: number): Promise<ImportResult> {
  const key = keyFor(osuId, "favorites");
  const present = new Set(Object.keys(await hash.getAll(key)));
  const result: ImportResult = { fetched: 0, added: 0, alreadyThere: 0, skippedByLimit: 0 };
  let batch: Record<string, string> = {};
  const flush = async () => {
    await hash.setMany(key, batch);
    batch = {};
  };

  for (let page = 0; page < IMPORT_MAX_PAGES; page++) {
    const sets = await osuGet<RawBeatmapset[]>(`/users/${osuId}/beatmapsets/favourite`, {
      limit: String(IMPORT_PAGE),
      offset: String(page * IMPORT_PAGE),
    });
    if (sets.length === 0) break;
    result.fetched += sets.length;

    for (const raw of sets) {
      const id = String(raw.id);
      if (present.has(id)) {
        result.alreadyThere++;
      } else if (present.size >= limit) {
        result.skippedByLimit++;
      } else {
        present.add(id);
        batch[id] = JSON.stringify({ ...toBeatmapset(raw), addedAt: Date.now() - result.added });
        result.added++;
      }
    }
    if (Object.keys(batch).length >= 100) await flush();
    if (sets.length < IMPORT_PAGE) break;
  }
  await flush();
  return result;
}
