// Faux serveur osu! pour tester shOsu! en local (OAuth complet + API v2 utilisée par l'app).
import http from "node:http";

const PORT = Number(process.env.PORT || 4010);
const MODES = ["osu", "taiko", "fruits", "mania"];

const ARTISTS = ["Camellia", "xi", "Kano", "DragonForce", "Sota Fujimori", "Aitsuki Nakuru", "Mili", "Kenji Ninuma", "LeaF", "Halozy", "Mameyudoufu", "Team Grimoire"];
const WORDS = ["Freedom", "Blue Zenith", "Hyper", "Through the Fire", "Sparkle", "Neon", "Gravity", "Ascension", "Echo", "Crystal", "Memory", "Horizon", "Voyage", "Reflection", "Starlight", "Pulse"];
const TAGS = ["speed", "stream", "jump", "tech", "anime", "electronic", "rock", "vocal", "farm", "marathon", "japanese", "english"];

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ids réels (couvertures/aperçus existent chez osu!) : 41823 + pas de 211
const sets = [];
for (let i = 0; i < 48; i++) {
  const id = 41823 + i * 211;
  const bpm = 120 + Math.floor(rnd() * 120);
  const artist = ARTISTS[i % ARTISTS.length];
  const title = `${pick(WORDS)} ${pick(WORDS)}`;
  const diffs = [];
  const n = 3 + Math.floor(rnd() * 3);
  for (let d = 0; d < n; d++) {
    const stars = 1.5 + d * (1 + rnd()) + rnd();
    diffs.push({
      id: id * 10 + d,
      beatmapset_id: id,
      mode: i % 7 === 0 ? "mania" : "osu",
      version: ["Easy", "Normal", "Hard", "Insane", "Extra", "Extreme"][d],
      difficulty_rating: Math.round(stars * 100) / 100,
      cs: 4 + (d % 2) * 0.5,
      ar: 6 + d * 0.8,
      accuracy: 6 + d * 0.7,
      drain: 5 + d * 0.6,
      bpm,
      total_length: 90 + Math.floor(rnd() * 120),
      max_combo: 200 + d * 180,
      count_circles: 150 + d * 90,
      count_sliders: 60 + d * 40,
      count_spinners: 1 + (d % 3),
      checksum: `md5-${id}-${d}`,
    });
  }
  sets.push({
    id,
    title,
    artist,
    creator: pick(["Sotarks", "Monstrata", "Nathan", "-Tochi", "Mazzerin"]),
    user_id: 100000 + i,
    status: pick(["ranked", "ranked", "loved", "approved"]),
    bpm,
    source: i % 3 === 0 ? "Touhou" : "",
    tags: `${pick(TAGS)} ${pick(TAGS)} ${pick(TAGS)}`,
    genre: { name: pick(["Electronic", "Rock", "Pop", "Anime"]) },
    language: { name: pick(["Japanese", "English", "Instrumental"]) },
    play_count: 1000 + Math.floor(rnd() * 900000),
    favourite_count: 10 + Math.floor(rnd() * 5000),
    ranked_date: "2024-0" + (1 + (i % 9)) + "-12T10:00:00Z",
    preview_url: `//b.ppy.sh/preview/${id}.mp3`,
    beatmaps: diffs,
  });
}
const byId = new Map(sets.map((s) => [s.id, s]));

const USERS = {
  38656812: { id: 38656812, username: "Vinncent", country_code: "FR", modes: { osu: { pp: 4231, rank: 649, plays: 18234 }, mania: { pp: 2900, rank: 486, plays: 4100 } } },
  37954459: { id: 37954459, username: "maybe_unknow", country_code: "FR", modes: {} },
};
const userByRef = (ref, key) =>
  Object.values(USERS).find((u) => (key === "username" ? u.username.toLowerCase() === String(ref).toLowerCase() : String(u.id) === String(ref)));

function statsFor(u, mode) {
  const m = u.modes[mode];
  return {
    pp: m ? m.pp : 0,
    global_rank: m ? m.rank : null,
    country_rank: m ? Math.ceil(m.rank / 20) : null,
    hit_accuracy: m ? 97.8 : 0,
    play_count: m ? m.plays : 0,
    play_time: m ? m.plays * 150 : 0,
    ranked_score: m ? m.plays * 900000 : 0,
    maximum_combo: m ? 2301 : 0,
    level: { current: m ? 98 : 1, progress: 0 },
    grade_counts: { ss: m ? 40 : 0, ssh: m ? 5 : 0, s: m ? 300 : 0, sh: m ? 22 : 0, a: m ? 800 : 0 },
    is_ranked: Boolean(m),
  };
}

function scoreFor(set, diff, i, mods) {
  return {
    id: 9000 + i,
    accuracy: 0.97 + (i % 5) / 200,
    mods,
    score: 1000000 - i * 777,
    max_combo: diff.max_combo,
    passed: true,
    pp: 320 - i * 2,
    rank: ["SS", "S", "A", "SH"][i % 4],
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    mode: diff.mode,
    beatmap: { ...diff, id: diff.id, beatmapset_id: set.id },
    beatmapset: { id: set.id, title: set.title, artist: set.artist, creator: set.creator, status: set.status },
    weight: { percentage: 100 * 0.95 ** i, pp: (320 - i * 2) * 0.95 ** i },
  };
}

function userScores(u, mode, kind, limit, offset) {
  const m = u.modes[mode];
  if (!m) return [];
  const out = [];
  const modPool = [[], ["HD"], ["HD", "DT"], ["HR"], ["DT"], []];
  for (let i = 0; i < 100; i++) {
    const set = sets[(i * 3 + (kind === "recent" ? 1 : 0)) % sets.length];
    const diff = set.beatmaps[set.beatmaps.length - 1 - (i % 2)];
    if (!diff) continue;
    out.push(scoreFor(set, { ...diff, mode }, i, modPool[i % modPool.length]));
  }
  return out.slice(offset, offset + limit);
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const codes = new Map();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  let raw = "";
  for await (const chunk of req) raw += chunk;

  // --- OAuth ---------------------------------------------------------------
  if (path === "/oauth/authorize") {
    const code = "code" + Math.random().toString(16).slice(2);
    codes.set(code, true);
    const redirect = new URL(url.searchParams.get("redirect_uri"));
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", url.searchParams.get("state") || "");
    res.writeHead(302, { Location: redirect.toString() });
    return res.end();
  }
  if (path === "/oauth/token") {
    let params = {};
    try { params = JSON.parse(raw); } catch { params = Object.fromEntries(new URLSearchParams(raw)); }
    return send(res, 200, { token_type: "Bearer", expires_in: 86400, access_token: "tok-" + (params.grant_type || ""), refresh_token: "r" });
  }
  if (path === "/api/v2/me") {
    const u = USERS[process.env.ME_ID || 38656812];
    return send(res, 200, { id: u.id, username: u.username, avatar_url: `https://a.ppy.sh/${u.id}` });
  }

  if (!path.startsWith("/api/v2/")) return send(res, 404, { error: "not found" });
  const p = path.slice("/api/v2".length);

  // --- Recherche -----------------------------------------------------------
  if (p === "/beatmapsets/search") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const m = url.searchParams.get("m");
    let list = sets.filter((s) => !q || `${s.title} ${s.artist} ${s.creator} ${s.tags}`.toLowerCase().includes(q) || q.split(/\s+/).every((w) => `${s.title} ${s.artist} ${s.creator} ${s.tags} ${s.source}`.toLowerCase().includes(w)));
    if (m !== null) list = list.filter((s) => s.beatmaps.some((b) => MODES.indexOf(b.mode) === Number(m)));
    const status = url.searchParams.get("s");
    if (status && status !== "any") list = list.filter((s) => s.status === status);
    const sort = url.searchParams.get("sort") || "";
    if (sort.startsWith("plays")) list = [...list].sort((a, b) => b.play_count - a.play_count);
    if (sort.startsWith("favourites")) list = [...list].sort((a, b) => b.favourite_count - a.favourite_count);
    const start = Number(url.searchParams.get("cursor_string") || 0);
    const page = list.slice(start, start + 20);
    return send(res, 200, { beatmapsets: page, cursor_string: start + 20 < list.length ? String(start + 20) : null, total: list.length });
  }
  let match = /^\/beatmapsets\/(\d+)$/.exec(p);
  if (match) {
    const s = byId.get(Number(match[1]));
    return s ? send(res, 200, s) : send(res, 404, { error: null });
  }

  match = /^\/beatmaps\/(\d+)$/.exec(p);
  if (match) {
    const set = sets.find((s) => s.beatmaps.some((b) => b.id === Number(match[1])));
    const diff = set?.beatmaps.find((b) => b.id === Number(match[1]));
    return diff ? send(res, 200, { ...diff, beatmapset: { id: set.id, title: set.title, artist: set.artist } }) : send(res, 404, { error: null });
  }

  // --- Attributs de difficulté (POST /beatmaps/:id/attributes) ---------------
  match = /^\/beatmaps\/(\d+)\/attributes$/.exec(p);
  if (match && req.method === "POST") {
    const body = JSON.parse(raw || "{}");
    const mods = Array.isArray(body.mods) ? body.mods : [];
    const set = sets.find((s) => s.beatmaps.some((b) => b.id === Number(match[1])));
    const diff = set?.beatmaps.find((b) => b.id === Number(match[1]));
    if (!diff) return send(res, 404, { error: null });
    let mult = 1;
    if (mods.includes("DT")) mult *= 1.45;
    if (mods.includes("HT")) mult *= 0.6;
    if (mods.includes("HR")) mult *= 1.08;
    if (mods.includes("EZ")) mult *= 0.85;
    if (mods.includes("FL")) mult *= 1.12;
    const sr = diff.difficulty_rating * mult;
    return send(res, 200, {
      attributes: {
        star_rating: sr,
        max_combo: diff.max_combo,
        aim_difficulty: sr * 1.25,
        speed_difficulty: sr * 1.1,
        speed_note_count: 120,
        slider_factor: 0.97,
        approach_rate: diff.ar,
        overall_difficulty: diff.accuracy,
      },
    });
  }

  // --- Joueurs -------------------------------------------------------------
  match = /^\/users\/([^/]+)\/scores\/(best|recent|firsts|pinned)$/.exec(p);
  if (match) {
    const u = userByRef(decodeURIComponent(match[1]), url.searchParams.get("key"));
    if (!u) return send(res, 404, { error: null });
    const mode = url.searchParams.get("mode") || "osu";
    return send(res, 200, userScores(u, mode, match[2], Number(url.searchParams.get("limit") || 25), Number(url.searchParams.get("offset") || 0)));
  }
  match = /^\/users\/([^/]+)\/beatmapsets\/([a-z_]+)$/.exec(p);
  if (match) {
    const u = userByRef(decodeURIComponent(match[1]), url.searchParams.get("key"));
    if (!u) return send(res, 404, { error: null });
    const limit = Number(url.searchParams.get("limit") || 20);
    const offset = Number(url.searchParams.get("offset") || 0);
    if (match[2] === "most_played") {
      const list = sets.slice(0, 40).map((s, i) => ({ beatmap_id: s.beatmaps[0].id, count: 400 - i * 7, beatmap: s.beatmaps[0], beatmapset: s }));
      return send(res, 200, list.slice(offset, offset + limit));
    }
    if (["favourite", "ranked", "loved", "graveyard", "pending", "guest", "nominated"].includes(match[2])) {
      const list = match[2] === "favourite" ? sets.slice(2, 22) : match[2] === "ranked" ? sets.slice(30, 33) : [];
      return send(res, 200, list.slice(offset, offset + limit));
    }
    return send(res, 404, { error: null });
  }
  match = /^\/users\/([^/]+)\/recent_activity$/.exec(p);
  if (match) {
    const u = userByRef(decodeURIComponent(match[1]), url.searchParams.get("key"));
    if (!u) return send(res, 404, { error: null });
    return send(res, 200, [
      { id: 1, type: "rank", created_at: new Date().toISOString(), scoreRank: "S", rank: 12, mode: "osu", beatmap: { title: sets[0].title, url: `/b/${sets[0].beatmaps[0].id}` } },
      { id: 2, type: "achievement", created_at: new Date(Date.now() - 86400000).toISOString(), achievement: { name: "Mania 5K" } },
    ]);
  }
  match = /^\/users\/([^/]+?)(?:\/(osu|taiko|fruits|mania))?$/.exec(p);
  if (match) {
    const ref = decodeURIComponent(match[1]);
    const u = userByRef(ref, url.searchParams.get("key"));
    if (!u) return send(res, 404, { error: null });
    const mode = match[2] || "osu";
    return send(res, 200, {
      id: u.id,
      username: u.username,
      country_code: u.country_code,
      avatar_url: `https://a.ppy.sh/${u.id}`,
      playmode: "osu",
      join_date: "2019-05-02T10:00:00Z",
      last_visit: new Date().toISOString(),
      is_online: false,
      statistics: statsFor(u, mode),
      badges: [{ description: "Winner", awarded_at: "2023-01-01T00:00:00Z" }],
      user_achievements: [{ achievement_id: 1, achieved_at: "2023-01-02T00:00:00Z" }],
      groups: [],
      playstyle: ["mouse", "tablet"],
      follower_count: 12,
      ranked_beatmapset_count: 3,
      favourite_beatmapset_count: 20,
      graveyard_beatmapset_count: 1,
      loved_beatmapset_count: 0,
      pending_beatmapset_count: 0,
      guest_beatmapset_count: 0,
      scores_best_count: 100,
      scores_first_count: 2,
      scores_recent_count: 20,
      beatmap_playcounts_count: 900,
      kudosu: { total: 14, available: 3 },
      rank_history: { mode, data: [900, 850, 800, 760, 700, 649] },
      monthly_playcounts: [{ start_date: "2026-09-01", count: 400 }, { start_date: "2026-10-01", count: 520 }],
    });
  }

  match = /^\/rankings\/(osu|taiko|fruits|mania)\/performance$/.exec(p);
  if (match) {
    const ranking = Array.from({ length: 50 }, (_, i) => ({
      pp: 20000 - i * 20,
      global_rank: i + 1,
      hit_accuracy: 99,
      play_count: 100000,
      user: { id: 700000 + i, username: `Pro${i + 1}`, country_code: "KR" },
    }));
    return send(res, 200, { ranking, total: 10000 });
  }

  return send(res, 404, { error: "unmocked " + p });
});

server.listen(PORT, () => console.log(`mock osu! on http://localhost:${PORT}`));
