import { cached, forget } from "./cache.server";
import { getCollection } from "./collections.server";
import { COLLECTION_ID_PATTERN } from "./collections";
import { DEFAULT_CUSTOM, MAX_FEATURED, cleanBio, isAccent, isBanner, type ProfileCustom } from "./profile-custom";
import { hash } from "./store.server";

/** `shosu:profiles` : osuId → JSON {bio, accent, banner, featured}. Lecture mise en cache 60 s par instance. */
const KEY = "shosu:profiles";

function parse(raw: string | null | undefined): ProfileCustom {
  if (!raw) return DEFAULT_CUSTOM;
  try {
    const v = JSON.parse(raw) as Partial<ProfileCustom>;
    return {
      bio: cleanBio(v.bio),
      accent: isAccent(v.accent) ? v.accent : DEFAULT_CUSTOM.accent,
      banner: isBanner(v.banner) ? v.banner : DEFAULT_CUSTOM.banner,
      featured: Array.isArray(v.featured)
        ? v.featured
            .filter((id): id is string => typeof id === "string" && COLLECTION_ID_PATTERN.test(id))
            .slice(0, MAX_FEATURED)
        : [],
    };
  } catch {
    return DEFAULT_CUSTOM;
  }
}

export function getProfileCustom(osuId: number): Promise<ProfileCustom> {
  return cached(`profile-custom:${osuId}`, 60_000, async () => {
    try {
      return parse(await hash.get(KEY, String(osuId)));
    } catch {
      return DEFAULT_CUSTOM;
    }
  });
}

/**
 * Enregistre le profil du joueur connecté. Les collections en vedette doivent lui appartenir **et être publiques** :
 * on ne met jamais en avant (ni ne révèle) une collection privée.
 */
export async function saveProfileCustom(osuId: number, input: unknown): Promise<ProfileCustom> {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const featured: string[] = [];
  if (Array.isArray(body.featured)) {
    for (const id of body.featured.slice(0, MAX_FEATURED * 2)) {
      if (typeof id !== "string" || !COLLECTION_ID_PATTERN.test(id) || featured.includes(id)) continue;
      const collection = await getCollection(id);
      if (collection && collection.ownerId === osuId && collection.public) featured.push(id);
      if (featured.length >= MAX_FEATURED) break;
    }
  }
  const custom: ProfileCustom = {
    bio: cleanBio(body.bio),
    accent: isAccent(body.accent) ? body.accent : DEFAULT_CUSTOM.accent,
    banner: isBanner(body.banner) ? body.banner : DEFAULT_CUSTOM.banner,
    featured,
  };
  await hash.set(KEY, String(osuId), JSON.stringify(custom));
  forget(`profile-custom:${osuId}`);
  return custom;
}

/** Efface le profil personnalisé du joueur (retour au profil par défaut). */
export async function deleteProfileCustom(osuId: number): Promise<void> {
  await hash.remove(KEY, String(osuId));
  forget(`profile-custom:${osuId}`);
}
