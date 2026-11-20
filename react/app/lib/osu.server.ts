import {
  API_MODE,
  API_STATUS,
  OSU_BASE_URL,
  type Beatmapset,
  type SearchResponse,
} from "./osu";

/**
 * Client API osu! — exécuté uniquement côté serveur.
 * Flux `client_credentials` : le secret ne quitte jamais le serveur et le
 * token est mis en cache par instance pendant sa durée de validité
 * (même principe que l'ancien api/search.js).
 */

export class OsuError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OsuError";
  }
}

/** URL de base d'osu! (surchargeable pour les tests locaux). */
export const osuBase = () => process.env.OSU_BASE_URL || OSU_BASE_URL;

/** Identifiants de l'application osu! : CLIENT_ID/SECRET, sinon OSU_CLIENT_ID/SECRET. */
export function osuCredentials() {
  const clientId = process.env.CLIENT_ID || process.env.OSU_CLIENT_ID || "";
  const clientSecret = process.env.CLIENT_SECRET || process.env.OSU_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

let cachedToken: string | null = null;
let expiresAt = 0;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;

  const { clientId, clientSecret } = osuCredentials();
  if (!clientId || !clientSecret) throw new OsuError("Missing osu! credentials", 500);

  const response = await fetch(`${osuBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "public",
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new OsuError(`osu! OAuth HTTP ${response.status}`, 502);

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new OsuError("osu! OAuth: no access token", 502);

  cachedToken = data.access_token;
  expiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

type RawBeatmapset = {
  id: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  mode?: string;
  preview_url?: string | null;
  beatmaps?: { mode: string; difficulty_rating: number }[];
};

function toBeatmapset(raw: RawBeatmapset): Beatmapset {
  const maps = raw.beatmaps;
  // Même règle que script.js : modes des difficultés, sinon `mode` du set.
  const modes = maps
    ? [...new Set(maps.map((bm) => bm.mode.toLowerCase()))]
    : [raw.mode ? raw.mode.toLowerCase() : ""];
  return {
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
    creator: raw.creator,
    status: raw.status,
    modes,
    stars: maps && maps.length > 0 ? maps[0].difficulty_rating : null,
    minStars: maps && maps.length > 0 ? Math.min(...maps.map((m) => m.difficulty_rating)) : null,
    maxStars: maps && maps.length > 0 ? Math.max(...maps.map((m) => m.difficulty_rating)) : null,
    previewFile: raw.preview_url ? (raw.preview_url.split("/").pop() ?? null) : null,
  };
}

export async function searchBeatmapsets(params: {
  q: string;
  mode?: string;
  status?: string;
  cursor?: string | null;
}): Promise<SearchResponse> {
  const url = new URL(`${osuBase()}/api/v2/beatmapsets/search`);
  url.searchParams.set("q", params.q);
  // Les filtres sont aussi transmis à osu! quand l'API les connaît, pour que
  // les résultats renvoyés soient pertinents (le navigateur filtre ensuite,
  // comme avant, pour les statuts que l'API ne gère pas).
  if (params.mode && params.mode in API_MODE) {
    url.searchParams.set("m", String(API_MODE[params.mode]));
  }
  if (params.status && API_STATUS.has(params.status)) {
    url.searchParams.set("s", params.status);
  }
  if (params.cursor) url.searchParams.set("cursor_string", params.cursor);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    // Le token a pu être révoqué : on le jette pour forcer un renouvellement.
    if (response.status === 401) cachedToken = null;
    throw new OsuError("osu! search failed", response.status === 429 ? 429 : 502);
  }

  const data = (await response.json()) as {
    beatmapsets?: RawBeatmapset[];
    cursor_string?: string | null;
  };

  return {
    beatmapsets: (data.beatmapsets ?? []).map(toBeatmapset),
    cursor: data.cursor_string ?? null,
  };
}

// ---------------------------------------------------------------------------
// Profil d'un joueur (données publiques) — utilisé par le conseiller IA.
// ---------------------------------------------------------------------------

async function osuGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${osuBase()}/api/v2${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) cachedToken = null;
  if (!response.ok) {
    throw new OsuError(`osu! API ${path} HTTP ${response.status}`, response.status === 404 ? 404 : 502);
  }
  return (await response.json()) as T;
}

export type PlayerProfile = {
  mode: string;
  pp: number | null;
  globalRank: number | null;
  accuracy: number | null;
  playCount: number | null;
  /** Meilleurs scores, réduits à ce qui sert à recommander (aucune donnée d'identité). */
  topPlays: {
    stars: number;
    bpm: number | null;
    lengthSeconds: number | null;
    ar: number | null;
    od: number | null;
    cs: number | null;
    mods: string[];
    pp: number | null;
    accuracy: number | null;
    title: string;
    artist: string;
  }[];
  /** Statistiques calculées ici, pas par le modèle. */
  derived: {
    averageStars: number | null;
    maxStars: number | null;
    medianBpm: number | null;
    modUsage: Record<string, number>;
  };
};

type RawStats = {
  statistics?: {
    pp?: number;
    global_rank?: number | null;
    hit_accuracy?: number;
    play_count?: number;
  };
};

type RawScore = {
  pp?: number | null;
  accuracy?: number;
  mods?: (string | { acronym: string })[];
  beatmap?: {
    difficulty_rating: number;
    bpm?: number;
    total_length?: number;
    ar?: number;
    accuracy?: number;
    cs?: number;
  };
  beatmapset?: { title?: string; artist?: string };
};

const round = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : null;

export async function getPlayerProfile(osuId: number, mode: string): Promise<PlayerProfile> {
  const id = String(osuId);
  const [stats, scores] = await Promise.all([
    osuGet<RawStats>(`/users/${id}/${mode}`, { key: "id" }),
    osuGet<RawScore[]>(`/users/${id}/scores/best`, { mode, limit: "25" }),
  ]);

  const topPlays = scores
    .filter((score) => score.beatmap)
    .map((score) => ({
      stars: round(score.beatmap!.difficulty_rating) ?? 0,
      bpm: round(score.beatmap!.bpm, 0),
      lengthSeconds: round(score.beatmap!.total_length, 0),
      ar: round(score.beatmap!.ar, 1),
      od: round(score.beatmap!.accuracy, 1),
      cs: round(score.beatmap!.cs, 1),
      mods: (score.mods ?? []).map((m) => (typeof m === "string" ? m : m.acronym)),
      pp: round(score.pp, 0),
      accuracy: score.accuracy !== undefined ? round(score.accuracy * 100, 1) : null,
      title: (score.beatmapset?.title ?? "").slice(0, 80),
      artist: (score.beatmapset?.artist ?? "").slice(0, 60),
    }));

  const stars = topPlays.map((p) => p.stars);
  const bpms = topPlays.map((p) => p.bpm).filter((b): b is number => b !== null).sort((a, b) => a - b);
  const modUsage: Record<string, number> = {};
  for (const play of topPlays) for (const mod of play.mods) modUsage[mod] = (modUsage[mod] ?? 0) + 1;

  return {
    mode,
    pp: round(stats.statistics?.pp, 0),
    globalRank: stats.statistics?.global_rank ?? null,
    accuracy: round(stats.statistics?.hit_accuracy, 1),
    playCount: stats.statistics?.play_count ?? null,
    topPlays,
    derived: {
      averageStars: stars.length ? round(stars.reduce((a, b) => a + b, 0) / stars.length) : null,
      maxStars: stars.length ? Math.max(...stars) : null,
      medianBpm: bpms.length ? bpms[Math.floor(bpms.length / 2)] : null,
      modUsage,
    },
  };
}
