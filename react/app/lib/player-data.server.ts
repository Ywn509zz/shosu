import { cached } from "./cache.server";
import { osuGet, type RawBeatmapset } from "./osu.server";

/**
 * Sources brutes d'un joueur, lues UNE seule fois chez osu! (cache 5 min) et partagées par tous les calculs :
 * progression, analyse des performances, recommandations, Music DNA, compte vu par Stack. Aucun module ne doit appeler
 * `/users/{id}/…` pour ces données lui-même : il passe par ici. C'est ce qui garantit que les pages montrent les mêmes chiffres.
 *
 * Les lecteurs **lèvent** en cas d'échec (rien d'erroné n'est mis en cache) : à l'appelant de choisir (`.catch(() => [])`).
 */

export type RawBeatmapLite = {
  difficulty_rating: number;
  mode: string;
  bpm?: number;
  total_length?: number;
  ar?: number;
  cs?: number;
  accuracy?: number;
  beatmapset_id?: number;
};

export type RawScore = {
  pp?: number | null;
  accuracy?: number;
  passed?: boolean;
  mods?: (string | { acronym: string })[];
  statistics?: { count_miss?: number; miss?: number };
  beatmap?: RawBeatmapLite;
  beatmapset?: { id?: number; artist?: string; title?: string; tags?: string };
};

export type RawFavourite = Omit<RawBeatmapset, "beatmaps"> & {
  beatmaps?: RawBeatmapLite[];
  tags?: string;
  play_count?: number;
  genre_id?: number;
  language_id?: number;
};

export type RawMostPlayed = { count?: number; beatmapset?: { id?: number; artist?: string; title?: string } };

export type RawUser = {
  id: number;
  username: string;
  playmode?: string;
  rank_history?: { data?: number[] };
  monthly_playcounts?: { start_date?: string; count?: number }[];
  statistics?: {
    pp?: number;
    global_rank?: number | null;
    country_rank?: number | null;
    hit_accuracy?: number;
    play_count?: number;
    play_time?: number;
    level?: { current?: number };
  };
};

const TTL = 5 * 60_000;

/** Profil d'un joueur dans un mode (statistiques, historique de rang, parties par mois) ; `null` si osu! ne répond pas ou 404. */
export function getUserRaw(osuId: number, mode: string): Promise<RawUser | null> {
  return cached(`pd:user:${osuId}:${mode}`, TTL, async () => {
    try {
      return await osuGet<RawUser>(`/users/${osuId}/${mode}`, { key: "id" });
    } catch {
      return null;
    }
  });
}

/** Mode principal du joueur (`playmode` de son profil), « osu » à défaut. */
export function getMainMode(osuId: number): Promise<string> {
  return cached(`pd:mainmode:${osuId}`, 15 * 60_000, async () => {
    try {
      const user = await osuGet<{ playmode?: string }>(`/users/${osuId}`, { key: "id" });
      return user.playmode && ["osu", "taiko", "fruits", "mania"].includes(user.playmode) ? user.playmode : "osu";
    } catch {
      return "osu";
    }
  });
}

/** Ses 100 meilleurs scores. */
export function getBestScores(osuId: number, mode: string): Promise<RawScore[]> {
  return cached(`pd:best:${osuId}:${mode}`, TTL, () => osuGet<RawScore[]>(`/users/${osuId}/scores/best`, { mode, limit: "100" }));
}

/** Ses parties des dernières 24 h, échecs compris (osu! ne garde que ce délai pour « recent »). */
export function getRecentScores(osuId: number, mode: string): Promise<RawScore[]> {
  return cached(`pd:recent:${osuId}:${mode}`, 2 * 60_000, async () => {
    try {
      return await osuGet<RawScore[]>(`/users/${osuId}/scores/recent`, { mode, limit: "100", include_fails: "1" });
    } catch {
      return osuGet<RawScore[]>(`/users/${osuId}/scores/recent`, { mode, limit: "50", include_fails: "1" });
    }
  });
}

/** Ses beatmaps favorites sur osu! (50 dernières). */
export function getFavourites(osuId: number): Promise<RawFavourite[]> {
  return cached(`pd:fav:${osuId}`, TTL, () => osuGet<RawFavourite[]>(`/users/${osuId}/beatmapsets/favourite`, { limit: "50" }));
}

/** Ses beatmaps les plus jouées (50 premières). */
export function getMostPlayed(osuId: number): Promise<RawMostPlayed[]> {
  return cached(`pd:most:${osuId}`, TTL, () => osuGet<RawMostPlayed[]>(`/users/${osuId}/beatmapsets/most_played`, { limit: "50" }));
}
