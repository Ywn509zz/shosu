import { Button, Input } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouteLoaderData, useSearchParams } from "react-router";

import { BeatmapCard } from "~/components/beatmap-card";
import { Discovery } from "~/components/discovery";
import { ListenPanel, type AudioClip } from "~/components/listen-panel";
import { searchHref } from "~/lib/assistant";
import { ThemeToggle } from "~/components/theme-toggle";
import {
  MODE_IDS,
  MODE_OPTIONS,
  STATUS_IDS,
  STATUS_OPTIONS,
  type Beatmapset,
  type DiscoveryLens,
  type SearchResponse,
} from "~/lib/osu";
import { getDiscovery } from "~/lib/discover.server";
import { useHistory } from "~/lib/history";
import { errorMessage, readEvents } from "~/lib/stream-client";
import { useRipple } from "~/lib/use-ripple";
import { useSpeechRecognition } from "~/lib/use-speech-recognition";

import type { loader as layoutLoader } from "./layout";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => [{ title: "shOsu!" }];

/** Suggestions sous la recherche. En cas d'échec, la page s'affiche sans elles : la recherche n'en dépend pas. */
export async function loader() {
  try {
    return { lenses: await getDiscovery() };
  } catch {
    return { lenses: [] as DiscoveryLens[] };
  }
}

const RESULTS_PER_PAGE = 50;
/** Garde-fou : nombre max de pages osu! parcourues pour remplir une page filtrée. */
const MAX_FILL_FETCHES = 5;

type Phase = "idle" | "loading" | "empty" | "error" | "results";

/** Même règle de filtrage que script.js, appliquée à chaque page reçue. */
function matchesFilters(mapset: Beatmapset, mode: string, status: string) {
  if (mode !== "all" && !mapset.modes.includes(mode)) return false;
  if (status !== "all" && mapset.status.toLowerCase() !== status) return false;
  return true;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  useRipple();
  const signedIn = Boolean(useRouteLoaderData<typeof layoutLoader>("routes/layout")?.user);
  const history = useHistory();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("all");
  const [status, setStatus] = useState("all");

  const [phase, setPhase] = useState<Phase>("idle");
  const [allResults, setAllResults] = useState<Beatmapset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Recherche par le son (« Shazam pour osu! »).
  const [listenOpen, setListenOpen] = useState(false);
  const [listenSummary, setListenSummary] = useState<string | null>(null);
  const [listenStatus, setListenStatus] = useState("");
  const [listenError, setListenError] = useState("");

  // Filtres figés au moment de la recherche (comme script.js).
  const searchedRef = useRef({ q: "", mode: "all", status: "all" });
  const requestRef = useRef(0);

  async function fetchPage(q: string, m: string, s: string, next: string | null) {
    const params = new URLSearchParams({ q, mode: m, status: s });
    if (next) params.set("cursor", next);
    const response = await fetch(`/api/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as SearchResponse;
  }

  async function searchBeatmap(override?: { q?: string; mode?: string; status?: string }) {
    const q = (override?.q ?? query).trim();
    const searchMode = override?.mode ?? mode;
    const searchStatus = override?.status ?? status;
    if (!q) {
      alert("Please enter a song name or artist.");
      return;
    }

    const id = ++requestRef.current;
    setListenSummary(null);
    setListenError("");
    setListenOpen(false);
    setPhase("loading");

    try {
      const data = await fetchPage(q, searchMode, searchStatus, null);
      if (id !== requestRef.current) return; // une recherche plus récente a pris le relais

      const filtered = data.beatmapsets.filter((m) => matchesFilters(m, searchMode, searchStatus));
      if (filtered.length === 0 && !data.cursor) {
        setPhase("empty");
        return;
      }

      searchedRef.current = { q, mode: searchMode, status: searchStatus };
      history.addSearch({ q, mode: searchMode, status: searchStatus });
      setAllResults(filtered);
      setCursor(data.cursor);
      setPage(1);
      setPhase(filtered.length === 0 ? "empty" : "results");
    } catch (error) {
      console.error(error);
      if (id === requestRef.current) setPhase("error");
    }
  }

  /** « Next → » au bout de la liste : charge la page suivante côté osu!. */
  async function loadMore() {
    if (loadingMore || !cursor) return;
    const { q, mode: m, status: s } = searchedRef.current;
    const id = requestRef.current;
    setLoadingMore(true);

    try {
      let next: string | null = cursor;
      let added: Beatmapset[] = [];
      for (let i = 0; i < MAX_FILL_FETCHES && next && added.length === 0; i++) {
        const data = await fetchPage(q, m, s, next);
        if (id !== requestRef.current) return;
        const seen = new Set(allResults.map((r) => r.id));
        added = data.beatmapsets.filter((r) => !seen.has(r.id) && matchesFilters(r, m, s));
        next = data.cursor;
      }
      setCursor(next);
      if (added.length > 0) {
        // Les nouveaux résultats s'ajoutent à la suite ; on affiche la page
        // locale (50 par page) où ils commencent.
        setPage(Math.floor(allResults.length / RESULTS_PER_PAGE) + 1);
        setAllResults((prev) => [...prev, ...added]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * Recherche par le son : l'extrait est analysé par Gemini (voir /api/listen), puis les beatmaps de ce
   * morceau et des beatmaps proches s'affichent dans la grille, sous un résumé de ce qui a été entendu.
   */
  async function identifySound(clip: AudioClip) {
    const id = ++requestRef.current;
    setListenOpen(false);
    setListenSummary(null);
    setListenError("");
    setListenStatus("J'écoute ton extrait…");
    setPhase("loading");

    let text = "";
    const cards: Beatmapset[] = [];
    let errorCode: string | null = null;

    try {
      const response = await fetch("/api/listen", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", Accept: "application/x-ndjson" },
        body: clip.wav,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        errorCode = body?.error ?? "";
      } else {
        await readEvents(response, (event) => {
          if (id !== requestRef.current) return;
          if (event.t === "status") setListenStatus(event.text);
          else if (event.t === "delta") text += event.text;
          else if (event.t === "cards") {
            for (const item of event.items) if (!cards.some((c) => c.id === item.id)) cards.push(item);
          } else if (event.t === "error") errorCode = event.code;
        });
      }
    } catch {
      errorCode = "";
    }

    if (id !== requestRef.current) return; // une recherche plus récente a pris le relais
    setListenStatus("");
    if (errorCode !== null) {
      setListenError(errorMessage(errorCode));
      setPhase("error");
      return;
    }

    searchedRef.current = { q: "", mode: "all", status: "all" };
    history.addListen({ summary: text.trim(), items: cards.slice(0, 4).map((c) => ({ id: c.id, title: c.title, artist: c.artist })) });
    setAllResults(cards);
    setCursor(null);
    setPage(1);
    setListenSummary(text.trim() || null);
    setPhase(cards.length > 0 ? "results" : "empty");
  }

  function clearSearch() {
    requestRef.current++;
    setListenSummary(null);
    setListenError("");
    setListenOpen(false);
    setQuery("");
    setAllResults([]);
    setCursor(null);
    setPhase("idle");
  }

  const voice = useSpeechRecognition((text) => {
    setQuery(text);
    void searchBeatmap({ q: text });
  });

  // Lien profond : /?q=…&mode=…&status=… lance la recherche (utilisé par l'assistant).
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.toString();
  useEffect(() => {
    const q = searchParams.get("q")?.trim().slice(0, 200);
    if (!q) return;
    const m = searchParams.get("mode") ?? "all";
    const s = searchParams.get("status") ?? "all";
    const linkedMode = MODE_IDS.includes(m) ? m : "all";
    const linkedStatus = STATUS_IDS.includes(s) ? s : "all";
    setQuery(q);
    setMode(linkedMode);
    setStatus(linkedStatus);
    void searchBeatmap({ q, mode: linkedMode, status: linkedStatus });
    // On ne relance que lorsque les paramètres de l'URL changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const totalPages = Math.ceil(allResults.length / RESULTS_PER_PAGE);
  const pageResults = allResults.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE);
  const hasNext = page < totalPages || cursor !== null;
  const showPagination = phase === "results" && (page > 1 || hasNext);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">BEATMAP DISCOVERY</p>
        <h1>La prochaine musique à jouer est ici.</h1>
        <p className="hero-copy">
          Recherche, écoute et trouve rapidement ton prochain beatmap favori.
        </p>

        <div className="search-panel">
          <div className="search-field">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <Input
              type="text"
              id="songName"
              aria-label="Rechercher un titre, un artiste"
              placeholder="Rechercher un titre, un artiste..."
              value={query}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchBeatmap();
              }}
            />
          </div>
          <div className="buttons">
            <Button
              id="searchButton"
              className="search-btn"
              aria-label="Rechercher"
              onPress={() => void searchBeatmap()}
            />
            <ThemeToggle />
            {voice.supported !== false && (
              <Button id="micButton" aria-label="Recherche vocale" onPress={voice.toggle}>
                🎙️
              </Button>
            )}
            <Button
              id="listenButton"
              aria-label="Identifier un son (Shazam pour osu!)"
              aria-expanded={listenOpen}
              aria-controls="home-listen"
              onPress={() => setListenOpen((open) => !open)}
            >
              🎧
            </Button>
            <Button
              id="clearButton"
              className="suggestion-btn"
              aria-label="Effacer la recherche"
              onPress={clearSearch}
            >
              🗑
            </Button>
          </div>
        </div>

        {listenOpen && (
          <div className="listen-popover">
            <ListenPanel
              id="home-listen"
              signedIn={signedIn}
              busy={phase === "loading"}
              onClip={(clip) => void identifySound(clip)}
            />
          </div>
        )}
      </section>

      <div id="filters" className="filters">
        <div className="filter-label">
          <span className="filter-icon">⚙</span>
          <span>Affiner les résultats</span>
        </div>
        <label htmlFor="mode">Mode :</label>
        <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} translate={"noTranslate" in o ? "no" : undefined}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="status">Statut :</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} translate={"noTranslate" in o ? "no" : undefined}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div id="result"></div>
      <div id="results" className="results-grid" aria-busy={phase === "loading"}>
        {phase === "loading" && (
          <>
            <div className="spinner" role="status" aria-label={listenStatus || "Chargement"} />
            {listenStatus && <p className="spinner-status">{listenStatus}</p>}
          </>
        )}
        {phase === "empty" && !listenSummary && <span style={{ color: "red" }}>No beatmaps found.</span>}
        {phase === "error" && (
          <span style={{ color: "red" }}>{listenError || "Error fetching data. Try again later."}</span>
        )}
        {listenSummary && (phase === "results" || phase === "empty") && (
          <div className="listen-summary" role="status">
            <strong>🎧 RÉSULTAT DE L'ÉCOUTE</strong>
            {listenSummary}
          </div>
        )}
        {phase === "results" && (
          <>
            <p className="sr-only" aria-live="polite">
              {allResults.length} beatmapsets
            </p>
            {pageResults.map((mapset) => (
              <BeatmapCard key={mapset.id} mapset={mapset} queue={pageResults} />
            ))}
            {showPagination && (
              <div className="pagination">
                {page > 1 && (
                  <Button onPress={() => setPage((p) => p - 1)}>
                    ← Previous
                  </Button>
                )}
                {hasNext && (
                  <Button
                    isPending={loadingMore}
                    onPress={() => {
                      if (page < totalPages) setPage((p) => p + 1);
                      else void loadMore();
                    }}
                  >
                    Next →
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {phase === "idle" && history.searches.length > 0 && (
        <nav className="recent-searches" aria-label="Recherches récentes">
          <span>Récent</span>
          {history.searches.slice(0, 6).map((entry) => (
            <Link key={entry.at} className="chip" to={searchHref(entry)}>
              {entry.q}
            </Link>
          ))}
          <Link className="recent-more" to="/history">
            Tout l'historique →
          </Link>
        </nav>
      )}

      {phase === "idle" && loaderData.lenses.length > 0 && <Discovery lenses={loaderData.lenses} />}
    </>
  );
}
