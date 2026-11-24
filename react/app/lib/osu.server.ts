import { cached } from "./cache.server";
import { bump } from "./usage-buffer";
import {
  API_MODE,
  API_STATUS,
  OSU_BASE_URL,
  parsePlayerRef,
  type Beatmapset,
  type BeatmapsetDetail,
  type PlayerPage,
  type PlayerSummary,
  type SearchResponse,
  type TopPlay,
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

export type RawBeatmapset = {
  id: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  mode?: string;
  bpm?: number;
  preview_url?: string | null;
  beatmaps?: { mode: string; difficulty_rating: number }[];
};

export function toBeatmapset(raw: RawBeatmapset): Beatmapset {
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
    bpm: typeof raw.bpm === "number" ? Math.round(raw.bpm) : null,
  };
}

/** Tris acceptés par la recherche osu! (liste blanche : jamais une valeur libre vers l'API). */
export const SEARCH_SORTS = ["plays_desc", "ranked_desc", "favourites_desc", "updated_desc", "rating_desc"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

async function searchBeatmapsetsUncached(params: {
  q: string;
  mode?: string;
  status?: string;
  cursor?: string | null;
  sort?: SearchSort;
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
  if (params.sort && (SEARCH_SORTS as readonly string[]).includes(params.sort)) url.searchParams.set("sort", params.sort);
  if (params.cursor) url.searchParams.set("cursor_string", params.cursor);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  bump("osu");

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

/** Recherche avec cache de 60 s (économise le quota osu!, accélère les recherches répétées). */
export function searchBeatmapsets(params: {
  q: string;
  mode?: string;
  status?: string;
  cursor?: string | null;
  sort?: SearchSort;
}): Promise<SearchResponse> {
  const key = `search:${params.q.toLowerCase()}|${params.mode ?? ""}|${params.status ?? ""}|${params.cursor ?? ""}|${params.sort ?? ""}`;
  return cached(key, 60_000, () => searchBeatmapsetsUncached(params));
}

// ---------------------------------------------------------------------------
// Profil d'un joueur (données publiques) — utilisé par le conseiller IA.
// ---------------------------------------------------------------------------

export async function osuGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${osuBase()}/api/v2${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  bump("osu");
  if (response.status === 401) cachedToken = null;
  if (!response.ok) {
    logOsuFailure("GET", path, response.status);
    throw new OsuError(`osu! API ${path} HTTP ${response.status}`, response.status === 404 ? 404 : 502);
  }
  return (await response.json()) as T;
}

/**
 * Journal des échecs de l'API osu! (hors 404, banals : joueur ou beatmap inconnus). Les identifiants numériques du chemin
 * sont masqués ; seul le type de requête et le code HTTP sont écrits, pour diagnostiquer un point d'accès qui répond mal.
 */
function logOsuFailure(method: string, path: string, status: number) {
  if (status === 404) return;
  console.error("osu! API failure:", method, path.replace(/\/\d+/g, "/:n").replace(/\?.*$/, ""), status);
}

/** Appel POST authentifié (ex. attributs de difficulté avec des mods). */
export async function osuPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${osuBase()}/api/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  bump("osu");
  if (response.status === 401) cachedToken = null;
  if (!response.ok) {
    logOsuFailure("POST", path, response.status);
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

// ---------------------------------------------------------------------------
// Détail d'une beatmap
// ---------------------------------------------------------------------------

type RawDifficulty = {
  id: number;
  mode: string;
  version: string;
  difficulty_rating: number;
  cs?: number;
  ar?: number;
  accuracy?: number;
  drain?: number;
  bpm?: number;
  total_length?: number;
  max_combo?: number | null;
  count_circles?: number;
  count_sliders?: number;
  count_spinners?: number;
};

type RawSetDetail = Omit<RawBeatmapset, "beatmaps"> & {
  bpm?: number;
  source?: string;
  tags?: string;
  genre?: { name?: string } | null;
  language?: { name?: string } | null;
  play_count?: number;
  favourite_count?: number;
  ranked_date?: string | null;
  user_id?: number;
  beatmaps?: RawDifficulty[];
};

const numOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function getBeatmapset(id: number): Promise<BeatmapsetDetail> {
  return cached(`set:${id}`, 5 * 60_000, async () => {
    const raw = await osuGet<RawSetDetail>(`/beatmapsets/${id}`);
    const base = toBeatmapset(raw as RawBeatmapset);
    const difficulties = (raw.beatmaps ?? [])
      .map((d) => ({
        id: d.id,
        mode: d.mode,
        version: String(d.version ?? "").slice(0, 80),
        stars: Math.round(d.difficulty_rating * 100) / 100,
        cs: numOrNull(d.cs),
        ar: numOrNull(d.ar),
        od: numOrNull(d.accuracy),
        hp: numOrNull(d.drain),
        bpm: numOrNull(d.bpm),
        lengthSeconds: numOrNull(d.total_length),
        maxCombo: numOrNull(d.max_combo),
        circles: numOrNull(d.count_circles),
        sliders: numOrNull(d.count_sliders),
        spinners: numOrNull(d.count_spinners),
      }))
      .sort((a, b) => a.stars - b.stars);

    return {
      ...base,
      source: raw.source ? String(raw.source).slice(0, 80) : null,
      tags: String(raw.tags ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 24)
        .map((t) => t.slice(0, 32)),
      genre: raw.genre?.name ?? null,
      language: raw.language?.name ?? null,
      bpm: numOrNull(raw.bpm),
      lengthSeconds: difficulties.length ? (difficulties[difficulties.length - 1].lengthSeconds ?? null) : null,
      playCount: numOrNull(raw.play_count),
      favouriteCount: numOrNull(raw.favourite_count),
      rankedDate: raw.ranked_date ?? null,
      creatorId: numOrNull(raw.user_id),
      difficulties,
    };
  });
}

// ---------------------------------------------------------------------------
// Joueurs : page de profil, recherche par pseudo, classements
// ---------------------------------------------------------------------------

type RawUser = {
  id: number;
  username: string;
  country_code?: string;
  statistics?: {
    pp?: number;
    global_rank?: number | null;
    country_rank?: number | null;
    hit_accuracy?: number;
    play_count?: number;
    play_time?: number;
    ranked_score?: number;
    maximum_combo?: number;
    level?: { current?: number };
    grade_counts?: { ss?: number; ssh?: number; s?: number; sh?: number; a?: number };
  };
};

type RawBestScore = {
  pp?: number | null;
  accuracy?: number;
  mods?: (string | { acronym: string })[];
  rank?: string;
  beatmap?: { difficulty_rating: number; version?: string; bpm?: number; total_length?: number };
  beatmapset?: { id?: number; title?: string; artist?: string };
};

function toSummary(user: RawUser): PlayerSummary {
  const st = user.statistics ?? {};
  return {
    id: user.id,
    username: String(user.username).slice(0, 30),
    country: user.country_code ?? null,
    globalRank: numOrNull(st.global_rank),
    countryRank: numOrNull(st.country_rank),
    pp: round(st.pp, 0),
    accuracy: round(st.hit_accuracy, 2),
    playCount: numOrNull(st.play_count),
  };
}

/** Profil complet d'un joueur (par identifiant ou pseudo) avec ses meilleurs scores. */
export function getPlayerPage(ref: string, mode: string, withTopPlays = true): Promise<PlayerPage> {
  const parsed = parsePlayerRef(ref);
  if (!parsed) throw new OsuError("Invalid player reference", 404);

  return cached(`player:${parsed.key}:${parsed.value.toLowerCase()}:${mode}:${withTopPlays}`, 5 * 60_000, async () => {
    // Un joueur qui n'a jamais joué dans ce mode n'est pas une erreur : on affiche son identité
    // avec « aucune statistique ». Si osu! refuse la variante par mode (404), on lit le profil général.
    let user: RawUser;
    try {
      user = await osuGet<RawUser>(`/users/${encodeURIComponent(parsed.value)}/${mode}`, { key: parsed.key });
    } catch (error) {
      if (!(error instanceof OsuError) || error.status !== 404) throw error;
      user = await osuGet<RawUser>(`/users/${encodeURIComponent(parsed.value)}`, { key: parsed.key });
    }
    const summary = toSummary(user);
    const st = user.statistics ?? {};
    const hasStats = (numOrNull(st.play_count) ?? 0) > 0 || (numOrNull(st.pp) ?? 0) > 0 || numOrNull(st.global_rank) !== null;

    let topPlays: TopPlay[] = [];
    if (withTopPlays && hasStats) {
      let scores: RawBestScore[] = [];
      try {
        scores = await osuGet<RawBestScore[]>(`/users/${user.id}/scores/best`, { mode, limit: "25" });
      } catch {
        /* pas de scores lisibles : le profil s'affiche quand même, sans la liste */
      }
      topPlays = scores
        .filter((score) => score.beatmap && score.beatmapset?.id)
        .map((score) => ({
          beatmapsetId: score.beatmapset!.id!,
          title: (score.beatmapset?.title ?? "").slice(0, 100),
          artist: (score.beatmapset?.artist ?? "").slice(0, 80),
          version: String(score.beatmap!.version ?? "").slice(0, 60),
          stars: round(score.beatmap!.difficulty_rating) ?? 0,
          pp: round(score.pp, 0),
          accuracy: score.accuracy !== undefined ? round(score.accuracy * 100, 2) : null,
          mods: (score.mods ?? []).map((m) => (typeof m === "string" ? m : m.acronym)),
          rank: score.rank ?? "",
          bpm: round(score.beatmap!.bpm, 0),
          lengthSeconds: round(score.beatmap!.total_length, 0),
        }));
    }

    return {
      ...summary,
      mode,
      hasStats,
      level: round(st.level?.current, 0),
      playTimeHours: st.play_time !== undefined ? Math.round(st.play_time / 3600) : null,
      rankedScore: numOrNull(st.ranked_score),
      maxCombo: numOrNull(st.maximum_combo),
      grades: {
        ss: (st.grade_counts?.ss ?? 0) + (st.grade_counts?.ssh ?? 0),
        s: (st.grade_counts?.s ?? 0) + (st.grade_counts?.sh ?? 0),
        a: st.grade_counts?.a ?? 0,
      },
      topPlays,
    };
  });
}

/**
 * Page de 10 joueurs (par défaut) ou de 50 (`size: 50` = une page osu! entière) d'un classement mondial ou par pays.
 * Avec 10 : page 1 = rangs 1 à 10, page 2 = 11 à 20… Avec 50 : page 1 = rangs 1 à 50, page 2 = 51 à 100…
 */
export async function getRankings(params: {
  mode: string;
  country?: string;
  page?: number;
  size?: 10 | 50;
}): Promise<{ players: PlayerSummary[]; total: number | null }> {
  const country = params.country && /^[A-Za-z]{2}$/.test(params.country) ? params.country.toUpperCase() : "";
  const size = params.size === 50 ? 50 : 10;
  const page = Math.min(Math.max(Math.floor(params.page ?? 1), 1), size === 50 ? 20 : 100);
  const start = (page - 1) * size;
  const apiPage = Math.floor(start / 50) + 1; // osu! renvoie 50 joueurs par page
  const offset = start % 50;

  const { players, total } = await cached(`rank:${params.mode}:${country}:${apiPage}`, 5 * 60_000, async () => {
    const query: Record<string, string> = {};
    if (country) query.country = country;
    if (apiPage > 1) query["cursor[page]"] = String(apiPage);

    const data = await osuGet<{
      ranking?: (RawUser["statistics"] & { user: RawUser })[];
      total?: number;
    }>(`/rankings/${params.mode}/performance`, query);

    const players = (data.ranking ?? []).map((entry, index) => {
      const summary = toSummary({ ...entry.user, statistics: entry });
      // La liste de classement ne renvoie pas toujours le rang : on le déduit de la position.
      const position = (apiPage - 1) * 50 + index + 1;
      if (country && summary.countryRank === null) summary.countryRank = position;
      if (!country && summary.globalRank === null) summary.globalRank = position;
      return summary;
    });
    return { players, total: numOrNull(data.total) };
  });

  return { players: players.slice(offset, offset + size), total };
}

// ---------------------------------------------------------------------------
// Une difficulté (par son identifiant de beatmap, pas de set)
// ---------------------------------------------------------------------------

export type DifficultyInfo = {
  id: number;
  setId: number;
  mode: string;
  version: string;
  title: string;
  stars: number;
  cs: number | null;
  ar: number | null;
  od: number | null;
  hp: number | null;
  bpm: number | null;
  lengthSeconds: number | null;
  maxCombo: number | null;
};

export function getDifficulty(id: number): Promise<DifficultyInfo> {
  return cached(`diff:${id}`, 10 * 60_000, async () => {
    const raw = await osuGet<RawDifficulty & { beatmapset_id?: number; beatmapset?: { title?: string } }>(`/beatmaps/${id}`);
    return {
      id: raw.id,
      setId: raw.beatmapset_id ?? 0,
      mode: raw.mode,
      version: String(raw.version ?? "").slice(0, 80),
      title: String(raw.beatmapset?.title ?? "").slice(0, 120),
      stars: Math.round(raw.difficulty_rating * 100) / 100,
      cs: numOrNull(raw.cs),
      ar: numOrNull(raw.ar),
      od: numOrNull(raw.accuracy),
      hp: numOrNull(raw.drain),
      bpm: numOrNull(raw.bpm),
      lengthSeconds: numOrNull(raw.total_length),
      maxCombo: numOrNull(raw.max_combo),
    };
  });
}
