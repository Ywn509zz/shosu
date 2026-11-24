import { beforeEach, describe, expect, it, vi } from "vitest";

// L'API osu! est remplacée : on ne teste que la logique de stockage et de visibilité.
vi.mock("~/lib/osu.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/osu.server")>()),
  getBeatmapset: async (id: number) => ({
    id,
    title: `Titre ${id}`,
    artist: "Artiste",
    creator: "Mappeur",
    status: "ranked",
    modes: ["osu"],
    stars: 3,
    minStars: 2,
    maxStars: 4,
    previewFile: null,
    bpm: 150,
    tags: [],
    difficulties: [],
  }),
}));

import {
  CollectionFullError,
  CollectionLimitError,
  CollectionNotFoundError,
  addToCollection,
  cloneCollection,
  createCollection,
  createFromList,
  deleteAllCollections,
  deleteCollection,
  getCollection,
  getCollectionItems,
  listCollections,
  listPublicCollections,
  removeFromCollection,
  updateCollection,
} from "~/lib/collections.server";
import { addToList } from "~/lib/lists.server";
import { deleteMyData } from "~/lib/my-data.server";
import { saveProfileCustom } from "~/lib/profile-custom.server";

let next = 1000;
let owner: { osuId: number; name: string };
let other: { osuId: number; name: string };
beforeEach(() => {
  owner = { osuId: next++, name: "Alice" };
  other = { osuId: next++, name: "Bob" };
});

describe("collections : propriété et visibilité", () => {
  it("une collection est privée par défaut et absente de l'index public", async () => {
    const c = await createCollection(owner, "Ma sélection", 5);
    expect(c.public).toBe(false);
    await addToCollection(owner.osuId, c.id, 41823, 200);
    expect((await listPublicCollections({ ownerId: owner.osuId })).length).toBe(0);
  });

  it("partager l'inscrit dans l'index, la rendre privée l'en retire aussitôt", async () => {
    const c = await createCollection(owner, "Partagée", 5);
    await addToCollection(owner.osuId, c.id, 41823, 200);
    await updateCollection(owner.osuId, c.id, { public: true });
    expect((await listPublicCollections({ ownerId: owner.osuId })).map((x) => x.id)).toContain(c.id);
    await updateCollection(owner.osuId, c.id, { public: false });
    expect((await listPublicCollections({ ownerId: owner.osuId })).map((x) => x.id)).not.toContain(c.id);
  });

  it("les collections vides ne sont pas listées publiquement", async () => {
    const c = await createCollection(owner, "Vide", 5);
    await updateCollection(owner.osuId, c.id, { public: true });
    expect((await listPublicCollections({ ownerId: owner.osuId })).length).toBe(0);
  });

  it("un autre joueur ne peut ni modifier ni supprimer ni remplir ma collection", async () => {
    const c = await createCollection(owner, "À moi", 5);
    await expect(updateCollection(other.osuId, c.id, { name: "Piratée" })).rejects.toBeInstanceOf(CollectionNotFoundError);
    await expect(deleteCollection(other.osuId, c.id)).rejects.toBeInstanceOf(CollectionNotFoundError);
    await expect(addToCollection(other.osuId, c.id, 1, 200)).rejects.toBeInstanceOf(CollectionNotFoundError);
    expect((await getCollection(c.id))!.name).toBe("À moi");
  });

  it("clone : possible depuis une collection publique, refusé depuis une privée", async () => {
    const c = await createCollection(owner, "Source", 5);
    await addToCollection(owner.osuId, c.id, 41823, 200);
    await expect(cloneCollection(other, c.id, { collections: 5, items: 200 })).rejects.toBeInstanceOf(CollectionNotFoundError);
    await updateCollection(owner.osuId, c.id, { public: true });
    const copy = await cloneCollection(other, c.id, { collections: 5, items: 200 });
    expect(copy.ownerId).toBe(other.osuId);
    expect(copy.public).toBe(false);
    expect((await getCollectionItems(copy.id)).map((i) => i.id)).toEqual([41823]);
  });

  it("limites : nombre de collections et taille", async () => {
    await createCollection(owner, "1", 2);
    await createCollection(owner, "2", 2);
    await expect(createCollection(owner, "3", 2)).rejects.toBeInstanceOf(CollectionLimitError);
    const c = (await listCollections(owner.osuId))[0];
    await addToCollection(owner.osuId, c.id, 1, 1);
    await expect(addToCollection(owner.osuId, c.id, 2, 1)).rejects.toBeInstanceOf(CollectionFullError);
  });

  it("couverture et compteur suivent les ajouts et retraits", async () => {
    const c = await createCollection(owner, "Couv", 5);
    await addToCollection(owner.osuId, c.id, 10, 200);
    await addToCollection(owner.osuId, c.id, 20, 200);
    expect((await getCollection(c.id))!.coverId).toBe(10);
    const after = await removeFromCollection(owner.osuId, c.id, 10);
    expect(after.count).toBe(1);
    expect(after.coverId).toBe(20);
  });

  it("noms nettoyés et identifiants invalides refusés", async () => {
    const c = await createCollection(owner, "  Nom\u0007   long  ", 5);
    expect(c.name).toBe("Nom long");
    await expect(createCollection(owner, "   ", 5)).rejects.toThrow("invalid_name");
    expect(await getCollection("../etc/passwd")).toBeNull();
  });
});

describe("partage d'une liste et suppression des données", () => {
  it("« Partager cette liste » crée une collection publique ; liste vide refusée", async () => {
    await expect(createFromList(owner, "favorites", 5)).rejects.toThrow("empty_list");
    await addToList(owner.osuId, "favorites", 41823, 200);
    const c = await createFromList(owner, "favorites", 5);
    expect(c.public).toBe(true);
    expect(c.count).toBe(1);
    expect((await listPublicCollections({ ownerId: owner.osuId })).length).toBe(1);
  });

  it("deleteMyData efface listes, collections (et leurs liens publics) et profil", async () => {
    await addToList(owner.osuId, "later", 41823, 200);
    const c = await createCollection(owner, "Publique", 5);
    await addToCollection(owner.osuId, c.id, 41823, 200);
    await updateCollection(owner.osuId, c.id, { public: true });
    const result = await deleteMyData(owner.osuId);
    expect(result.collections).toBe(1);
    expect(await getCollection(c.id)).toBeNull();
    expect((await listPublicCollections({ ownerId: owner.osuId })).length).toBe(0);
    expect((await listCollections(owner.osuId)).length).toBe(0);
  });

  it("deleteAllCollections ne touche pas aux collections des autres", async () => {
    const mine = await createCollection(owner, "A moi", 5);
    const theirs = await createCollection(other, "A lui", 5);
    await deleteAllCollections(owner.osuId);
    expect(await getCollection(mine.id)).toBeNull();
    expect((await getCollection(theirs.id))!.name).toBe("A lui");
  });
});

describe("profil personnalisé : collections en vedette", () => {
  it("écarte les collections privées, celles des autres, inconnues, et les doublons", async () => {
    const pub = await createCollection(owner, "Pub", 5);
    await addToCollection(owner.osuId, pub.id, 1, 200);
    await updateCollection(owner.osuId, pub.id, { public: true });
    const priv = await createCollection(owner, "Priv", 5);
    const foreign = await createCollection(other, "Autre", 5);
    await updateCollection(other.osuId, foreign.id, { public: true });

    const saved = await saveProfileCustom(owner.osuId, {
      bio: "x".repeat(400),
      accent: "pas-une-couleur",
      banner: "ocean",
      featured: [priv.id, foreign.id, "zzzzzzzzzz", pub.id, pub.id],
    });
    expect(saved.featured).toEqual([pub.id]);
    expect(saved.accent).toBe("violet");
    expect(saved.banner).toBe("ocean");
    expect(saved.bio.length).toBe(200);
  });
});
