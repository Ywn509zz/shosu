import { deleteAllCollections, getCollectionItems, listCollections } from "./collections.server";
import { clearLists, getListItems } from "./lists.server";
import { LIST_IDS } from "./lists";
import { getPlan } from "./plans.server";
import { deleteProfileCustom, getProfileCustom } from "./profile-custom.server";
import { deleteSnapshots, exportSnapshots } from "./progress.server";

/**
 * Données de shOsu! rattachées à un compte osu! : listes, collections, profil personnalisé, relevés quotidiens.
 * Exportables (JSON) et supprimables en un clic. Ne sont PAS concernés : l'historique, le thème et la conversation de Stack
 * (gardés dans le navigateur, effacés côté navigateur) et un plan Premium attribué par l'administrateur.
 */

export async function exportMyData(osuId: number, username: string) {
  const lists: Record<string, unknown[]> = {};
  for (const list of LIST_IDS) lists[list] = await getListItems(osuId, list);

  const collections = [];
  for (const collection of await listCollections(osuId)) {
    collections.push({ ...collection, beatmapsets: await getCollectionItems(collection.id) });
  }

  return {
    app: "shOsu!",
    exportedAt: new Date().toISOString(),
    account: { osuId, username, plan: await getPlan(osuId) },
    lists,
    collections,
    customProfile: await getProfileCustom(osuId),
    dailySnapshots: await exportSnapshots(osuId),
    notStoredOnServer: ["historique des recherches/écoutes/consultations", "thème", "conversation avec Stack"],
  };
}

export async function deleteMyData(osuId: number): Promise<{ collections: number }> {
  await clearLists(osuId);
  const collections = await deleteAllCollections(osuId);
  await deleteProfileCustom(osuId);
  await deleteSnapshots(osuId);
  return { collections };
}

/** Compteurs affichés sur la page « Mes données ». */
export async function summarizeMyData(osuId: number) {
  const [favorites, later, collections, snapshots, custom] = await Promise.all([
    getListItems(osuId, "favorites"),
    getListItems(osuId, "later"),
    listCollections(osuId),
    exportSnapshots(osuId),
    getProfileCustom(osuId),
  ]);
  return {
    favorites: favorites.length,
    later: later.length,
    collections: collections.length,
    sharedCollections: collections.filter((c) => c.public).length,
    snapshotDays: Object.keys(snapshots).length,
    customProfile: Boolean(custom.bio) || custom.featured.length > 0 || custom.accent !== "violet" || custom.banner !== "midnight",
  };
}
