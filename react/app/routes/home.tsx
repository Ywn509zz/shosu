import { Button, Input } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouteLoaderData, useSearchParams } from "react-router";

import { BeatmapCard } from "~/components/beatmap-card";
import { Discovery } from "~/components/discovery";
import { EmptyState } from "~/components/empty-state";
import { RecommendationsSection } from "~/components/recommendations";
import { ListenPanel, type AudioClip } from "~/components/listen-panel";
import { searchHref } from "~/lib/assistant";
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
import {
  FILTER_PARAMS,
  SORTS,
  activeFilterCount,
  filtersToParams,
  hasFilters,
  matchesRange,
  parseFilters,
  type SearchFilters,
} from "~/lib/search-filters";
import { useProgressive } from "~/lib/use-progressive";
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

/** Nombre de cartes ajoutées à chaque défilement (chargement progressif). */
const REVEAL_STEP = 18;
/** Garde-fou : nombre max de pages osu! parcourues pour remplir une page filtrée. */
const MAX_FILL_FETCHES = 5;

type Phase = "idle" | "loading" | "empty" | "error" | "results";

/** Même règle de filtrage que script.js, appliquée à chaque page reçue. */
function matchesFilters(mapset: Beatmapset, mode: string, status: string, filters: SearchFilters = {}) {
  if (mode !== "all" && !mapset.modes.includes(mode)) return false;
  if (status !== "all" && mapset.status.toLowerCase() !== status) return false;
  return matchesRange(mapset, filters);
}

type AdvancedForm = { smin: string; smax: string; bmin: string; bmax: string; lmax: string; sort: string };
const NO_ADVANCED: AdvancedForm = { smin: "", smax: "", bmin: "", bmax: "", lmax: "", sort: "" };
const toFilters = (form: AdvancedForm) => parseFilters((name) => (form as Record<string, string>)[name] ?? null);

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
  const [loadingMore, setLoadingMore] = useState(false);

  // Filtres avancés (étoiles, BPM, durée, tri).
  const [advanced, setAdvanced] = useState<AdvancedForm>(NO_ADVANCED);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Recherche par le son (« Shazam pour osu! »).
  const [listenOpen, setListenOpen] = useState(false);
  const [listenSummary, setListenSummary] = useState<string | null>(null);
  const [listenStatus, setListenStatus] = useState("");
  const [listenError, setListenError] = useState("");

  // Filtres figés au moment de la recherche (comme script.js).
  const searchedRef = useRef<{ q: string; mode: string; status: string; filters: SearchFilters }>({ q: "", mode: "all", status: "all", filters: {} });
  const requestRef = useRef(0);

  async function fetchPage(q: string, m: string, s: string, filters: SearchFilters, next: string | null) {
    const params = new URLSearchParams({ q, mode: m, status: s });
    filtersToParams(filters, params);
    if (next) params.set("cursor", next);
    const response = await fetch(`/api/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as SearchResponse;
  }

  async function searchBeatmap(override?: { q?: string; mode?: string; status?: string; filters?: SearchFilters }) {
    const q = (override?.q ?? query).trim();
    const searchMode = override?.mode ?? mode;
    const searchStatus = override?.status ?? status;
    const searchFilters = override?.filters ?? toFilters(advanced);
    if (!q && !hasFilters(searchFilters)) {
      alert("Please enter a song name or artist.");
      return;
    }

    const id = ++requestRef.current;
    setListenSummary(null);
    setListenError("");
    setListenOpen(false);
    setPhase("loading");

    try {
      const data = await fetchPage(q, searchMode, searchStatus, searchFilters, null);
      if (id !== requestRef.current) return; // une recherche plus récente a pris le relais

      const filtered = data.beatmapsets.filter((m) => matchesFilters(m, searchMode, searchStatus, searchFilters));
      if (filtered.length === 0 && !data.cursor) {
        setPhase("empty");
        return;
      }

      searchedRef.current = { q, mode: searchMode, status: searchStatus, filters: searchFilters };
      if (q) history.addSearch({ q, mode: searchMode, status: searchStatus });
      setAllResults(filtered);
      setCursor(data.cursor);
      setPhase(filtered.length === 0 ? "empty" : "results");
    } catch (error) {
      console.error(error);
      if (id === requestRef.current) setPhase("error");
    }
  }

  /** « Next → » au bout de la liste : charge la page suivante côté osu!. */
  async function loadMore() {
    if (loadingMore || !cursor) return;
    const { q, mode: m, status: s, filters: f } = searchedRef.current;
    const id = requestRef.current;
    setLoadingMore(true);

    try {
      let next: string | null = cursor;
      let added: Beatmapset[] = [];
      for (let i = 0; i < MAX_FILL_FETCHES && next && added.length === 0; i++) {
        const data = await fetchPage(q, m, s, f, next);
        if (id !== requestRef.current) return;
        const seen = new Set(allResults.map((r) => r.id));
        added = data.beatmapsets.filter((r) => !seen.has(r.id) && matchesFilters(r, m, s, f));
        next = data.cursor;
      }
      setCursor(next);
      // Les nouveaux résultats s'ajoutent à la suite de la grille (défilement continu).
      if (added.length > 0) setAllResults((prev) => [...prev, ...added]);
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

    searchedRef.current = { q: "", mode: "all", status: "all", filters: {} };
    history.addListen({ summary: text.trim(), items: cards.slice(0, 4).map((c) => ({ id: c.id, title: c.title, artist: c.artist })) });
    setAllResults(cards);
    setCursor(null);
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
    const q = (searchParams.get("q") ?? "").trim().slice(0, 200);
    const linkedFilters = parseFilters((name) => searchParams.get(name));
    if (!q && !hasFilters(linkedFilters)) return;
    const m = searchParams.get("mode") ?? "all";
    const s = searchParams.get("status") ?? "all";
    const linkedMode = MODE_IDS.includes(m) ? m : "all";
    const linkedStatus = STATUS_IDS.includes(s) ? s : "all";
    setQuery(q);
    setMode(linkedMode);
    setStatus(linkedStatus);
    setAdvanced({
      smin: String(linkedFilters.starsMin ?? ""),
      smax: String(linkedFilters.starsMax ?? ""),
      bmin: String(linkedFilters.bpmMin ?? ""),
      bmax: String(linkedFilters.bpmMax ?? ""),
      lmax: String(linkedFilters.lengthMax ?? ""),
      sort: linkedFilters.sort ?? "",
    });
    if (hasFilters(linkedFilters)) setShowAdvanced(true);
    void searchBeatmap({ q, mode: linkedMode, status: linkedStatus, filters: linkedFilters });
    // On ne relance que lorsque les paramètres de l'URL changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  // Chargement progressif : on montre REVEAL_STEP cartes, puis autant à chaque fois que le bas approche ; au bout de la
  // liste on va chercher la page osu! suivante tant qu'il en reste (`cursor`).
  const searchId = requestRef.current;
  const progressive = useProgressive(allResults.length, REVEAL_STEP, `${searchId}:${phase}`, () => {
    if (phase === "results" && cursor !== null) void loadMore();
  });
  const pageResults = allResults.slice(0, progressive.count);
  const canLoadMore = phase === "results" && (!progressive.done || cursor !== null);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">BEATMAP DISCOVERY</p>
        <h1>
          La prochaine musique à jouer <span className="accent-word">est ici.</span>
        </h1>
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

        <nav className="hero-links" aria-label="Raccourcis">
          <Link className="account-btn is-primary" to="/collections">
            Découvrir les collections
          </Link>
          {signedIn ? (
            <Link className="account-btn" to="/dna">
              Mon Music DNA
            </Link>
          ) : (
            <a className="account-btn" href="/api/auth/login">
              Se connecter avec osu!
            </a>
          )}
          <Link className="account-btn" to="/compare">
            Comparer deux beatmaps
          </Link>
        </nav>

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

      <div className="adv-filters">
        <Button
          className="adv-toggle"
          aria-expanded={showAdvanced}
          aria-controls="adv-panel"
          onPress={() => setShowAdvanced((open) => !open)}
        >
          <span aria-hidden>{showAdvanced ? "▾" : "▸"}</span> Filtres avancés
          {activeFilterCount(toFilters(advanced)) > 0 && <b className="adv-count">{activeFilterCount(toFilters(advanced))}</b>}
        </Button>
        {showAdvanced && (
          <form
            id="adv-panel"
            className="adv-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void searchBeatmap();
            }}
          >
            <fieldset>
              <legend>Étoiles</legend>
              <input type="number" inputMode="decimal" min={0} max={15} step={0.1} placeholder="min" aria-label="Étoiles minimum" value={advanced.smin} onChange={(e) => setAdvanced({ ...advanced, smin: e.target.value })} />
              <span aria-hidden>→</span>
              <input type="number" inputMode="decimal" min={0} max={15} step={0.1} placeholder="max" aria-label="Étoiles maximum" value={advanced.smax} onChange={(e) => setAdvanced({ ...advanced, smax: e.target.value })} />
            </fieldset>
            <fieldset>
              <legend>BPM</legend>
              <input type="number" inputMode="numeric" min={20} max={1000} placeholder="min" aria-label="BPM minimum" value={advanced.bmin} onChange={(e) => setAdvanced({ ...advanced, bmin: e.target.value })} />
              <span aria-hidden>→</span>
              <input type="number" inputMode="numeric" min={20} max={1000} placeholder="max" aria-label="BPM maximum" value={advanced.bmax} onChange={(e) => setAdvanced({ ...advanced, bmax: e.target.value })} />
            </fieldset>
            <fieldset>
              <legend>Durée max (s)</legend>
              <input type="number" inputMode="numeric" min={10} max={3600} placeholder="ex. 180" aria-label="Durée maximale en secondes" value={advanced.lmax} onChange={(e) => setAdvanced({ ...advanced, lmax: e.target.value })} />
            </fieldset>
            <fieldset>
              <legend>Tri</legend>
              <select aria-label="Tri des résultats" value={advanced.sort} onChange={(e) => setAdvanced({ ...advanced, sort: e.target.value })}>
                {SORTS.map((o) => (
                  <option key={o.id} value={o.id === "relevance" ? "" : o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </fieldset>
            <div className="adv-actions">
              <Button type="submit" className="account-btn is-primary">
                Appliquer
              </Button>
              <Button
                className="account-btn"
                onPress={() => {
                  setAdvanced(NO_ADVANCED);
                  if (query.trim()) void searchBeatmap({ filters: {} });
                }}
              >
                Réinitialiser
              </Button>
            </div>
          </form>
        )}
      </div>

      <div id="result"></div>
      <div id="results" className="results-grid" aria-busy={phase === "loading"}>
        {phase === "loading" && (
          <>
            <div className="spinner" role="status" aria-label={listenStatus || "Chargement"} />
            {listenStatus && <p className="spinner-status">{listenStatus}</p>}
          </>
        )}
        {phase === "empty" && !listenSummary && (
          <div className="grid-full">
            <EmptyState
              icon="🔍"
              title="Aucune beatmap trouvée"
              actions={
                <>
                  {hasFilters(toFilters(advanced)) && (
                    <Button
                      className="account-btn is-primary"
                      onPress={() => {
                        setAdvanced(NO_ADVANCED);
                        void searchBeatmap({ filters: {} });
                      }}
                    >
                      Retirer les filtres avancés
                    </Button>
                  )}
                  {(mode !== "all" || status !== "all") && (
                    <Button
                      className="account-btn"
                      onPress={() => {
                        setMode("all");
                        setStatus("all");
                        void searchBeatmap({ mode: "all", status: "all" });
                      }}
                    >
                      Tous les modes et statuts
                    </Button>
                  )}
                  <Button className="account-btn" onPress={clearSearch}>
                    Effacer la recherche
                  </Button>
                </>
              }
            >
              Essaie d'autres mots-clés (un artiste, un titre, un créateur ou un tag), ou élargis les filtres.
            </EmptyState>
          </div>
        )}
        {phase === "error" && (
          <div className="grid-full">
            <EmptyState
              icon="⚠"
              tone="error"
              title="La recherche n'a pas abouti"
              actions={
                !listenError && (
                  <Button className="account-btn is-primary" onPress={() => void searchBeatmap()}>
                    Réessayer
                  </Button>
                )
              }
            >
              {listenError || "osu! est momentanément indisponible ou trop sollicité. Réessaie dans un instant."}
            </EmptyState>
          </div>
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
            {canLoadMore && (
              <div className="load-more" ref={progressive.sentinel}>
                {loadingMore ? (
                  <>
                    <div className="skeleton card-skeleton" />
                    <div className="skeleton card-skeleton" />
                  </>
                ) : (
                  <Button className="load-more-btn" onPress={progressive.more}>
                    Charger plus
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

      {phase === "idle" && signedIn && <RecommendationsSection />}

      {phase === "idle" && loaderData.lenses.length > 0 && <Discovery lenses={loaderData.lenses} />}
    </>
  );
}
