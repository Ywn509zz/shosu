import { randomInt } from "node:crypto";

import { cleanName, COLLECTION_ID_PATTERN, MAX_COLLECTION_DESCRIPTION, MAX_COLLECTION_NAME, type Collection } from "./collections";
import type { ListItem } from "./lists";
import { fetchSlim, parseItem } from "./lists.server";
import { hash } from "./store.server";

/**
 * Collections personnalisées d'un joueur.
 *
 *   shosu:cols:<osuId>   table  id de collection → métadonnées (nom, partage, nombre de beatmaps…)
 *   shosu:col:<id>       table  id de beatmapset → beatmap (même forme que les listes)
 *   shosu:colidx         table  id de collection → osuId du propriétaire (pour ouvrir un lien partagé)
 *
 * L'identifiant d'une collection est aléatoire : c'est lui qui sert de lien de partage. Une collection n'est
 * lisible par d'autres que si son propriétaire l'a rendue publique.
 */

export class CollectionLimitError extends Error {}
export class CollectionFullError extends Error {}
export class CollectionNotFoundError extends Error {}

const metaKey = (osuId: number) => `shosu:cols:${osuId}`;
const itemsKey = (id: string) => `shosu:col:${id}`;
const INDEX_KEY = "shosu:colidx";
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sans i, l, o, 0, 1 (évite les confusions)

function newId(): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

function parseMeta(raw: string | null | undefined): Collection | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Collection>;
    if (typeof v.id !== "string" || !COLLECTION_ID_PATTERN.test(v.id) || typeof v.name !== "string") return null;
    return {
      id: v.id,
      name: cleanName(v.name) || "Collection",
      description: cleanName(v.description, MAX_COLLECTION_DESCRIPTION),
      public: v.public === true,
      count: typeof v.count === "number" && v.count >= 0 ? Math.floor(v.count) : 0,
      createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
      updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
      ownerId: typeof v.ownerId === "number" ? v.ownerId : 0,
      ownerName: cleanName(v.ownerName, 30),
    };
  } catch {
    return null;
  }
}

const save = (meta: Collection) => hash.set(metaKey(meta.ownerId), meta.id, JSON.stringify(meta));

/** Collections d'un joueur, la plus récemment modifiée d'abord. */
export async function listCollections(osuId: number): Promise<Collection[]> {
  const all = await hash.getAll(metaKey(osuId));
  return Object.values(all)
    .map(parseMeta)
    .filter((c): c is Collection => c !== null && c.ownerId === osuId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Une collection par son identifiant, quel que soit son propriétaire (la visibilité se règle à l'appelant). */
export async function getCollection(id: string): Promise<Collection | null> {
  if (!COLLECTION_ID_PATTERN.test(id)) return null;
  const owner = Number(await hash.get(INDEX_KEY, id));
  if (!Number.isInteger(owner) || owner < 1) return null;
  const meta = parseMeta(await hash.get(metaKey(owner), id));
  return meta && meta.ownerId === owner ? meta : null;
}

/** Collection du joueur, ou erreur : empêche de modifier celle d'un autre. */
async function ownedBy(osuId: number, id: string): Promise<Collection> {
  if (!COLLECTION_ID_PATTERN.test(id)) throw new CollectionNotFoundError();
  const meta = parseMeta(await hash.get(metaKey(osuId), id));
  if (!meta || meta.ownerId !== osuId) throw new CollectionNotFoundError();
  return meta;
}

export async function getCollectionItems(id: string): Promise<ListItem[]> {
  const all = await hash.getAll(itemsKey(id));
  return Object.values(all)
    .map(parseItem)
    .filter((item): item is ListItem => item !== null)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function createCollection(
  owner: { osuId: number; name: string },
  name: string,
  limit: number,
): Promise<Collection> {
  const clean = cleanName(name, MAX_COLLECTION_NAME);
  if (!clean) throw new Error("invalid_name");
  if ((await hash.length(metaKey(owner.osuId))) >= limit) throw new CollectionLimitError();

  const now = Date.now();
  const meta: Collection = {
    id: newId(),
    name: clean,
    description: "",
    public: false,
    count: 0,
    createdAt: now,
    updatedAt: now,
    ownerId: owner.osuId,
    ownerName: cleanName(owner.name, 30),
  };
  await save(meta);
  await hash.set(INDEX_KEY, meta.id, String(owner.osuId));
  return meta;
}

export async function updateCollection(
  osuId: number,
  id: string,
  patch: { name?: string; description?: string; public?: boolean },
): Promise<Collection> {
  const meta = await ownedBy(osuId, id);
  if (patch.name !== undefined) {
    const name = cleanName(patch.name, MAX_COLLECTION_NAME);
    if (!name) throw new Error("invalid_name");
    meta.name = name;
  }
  if (patch.description !== undefined) meta.description = cleanName(patch.description, MAX_COLLECTION_DESCRIPTION);
  if (patch.public !== undefined) meta.public = patch.public;
  meta.updatedAt = Date.now();
  await save(meta);
  return meta;
}

export async function deleteCollection(osuId: number, id: string): Promise<void> {
  await ownedBy(osuId, id);
  await hash.remove(metaKey(osuId), id);
  await hash.remove(INDEX_KEY, id);
  await hash.del(itemsKey(id));
}

export async function addToCollection(osuId: number, id: string, setId: number, limit: number): Promise<Collection> {
  const meta = await ownedBy(osuId, id);
  const key = itemsKey(id);
  if (!(await hash.has(key, String(setId))) && (await hash.length(key)) >= limit) throw new CollectionFullError();

  const slim = await fetchSlim(setId);
  await hash.set(key, String(setId), JSON.stringify({ ...slim, addedAt: Date.now() }));
  meta.count = await hash.length(key);
  meta.updatedAt = Date.now();
  await save(meta);
  return meta;
}

export async function removeFromCollection(osuId: number, id: string, setId: number): Promise<Collection> {
  const meta = await ownedBy(osuId, id);
  await hash.remove(itemsKey(id), String(setId));
  meta.count = await hash.length(itemsKey(id));
  meta.updatedAt = Date.now();
  await save(meta);
  return meta;
}

/** Pour une beatmap : dans lesquelles de mes collections se trouve-t-elle ? */
export async function membership(osuId: number, setId: number): Promise<{ collection: Collection; has: boolean }[]> {
  const collections = await listCollections(osuId);
  return Promise.all(
    collections.map(async (collection) => ({ collection, has: await hash.has(itemsKey(collection.id), String(setId)) })),
  );
}

/** Copie une collection publique (ou la mienne) dans les collections du joueur. */
export async function cloneCollection(
  viewer: { osuId: number; name: string },
  sourceId: string,
  limits: { collections: number; items: number },
): Promise<Collection> {
  const source = await getCollection(sourceId);
  if (!source || (!source.public && source.ownerId !== viewer.osuId)) throw new CollectionNotFoundError();

  const copy = await createCollection(
    viewer,
    source.ownerId === viewer.osuId ? `${source.name} (copie)`.slice(0, MAX_COLLECTION_NAME) : source.name,
    limits.collections,
  );
  const items = (await getCollectionItems(sourceId)).slice(0, limits.items);
  const key = itemsKey(copy.id);
  for (const item of items) await hash.set(key, String(item.id), JSON.stringify(item));
  copy.count = items.length;
  copy.description = source.description;
  copy.updatedAt = Date.now();
  await save(copy);
  return copy;
}
