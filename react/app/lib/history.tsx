import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Historique des recherches et des écoutes, gardé dans le navigateur (localStorage) : rien n'est envoyé au serveur,
 * il ne consomme aucune ressource et reste privé. Un historique par compte osu! (et un pour les visiteurs).
 */

export type SearchEntry = { q: string; mode: string; status: string; at: number };
export type ListenItem = { id: number; title: string; artist: string };
export type ListenEntry = { summary: string; items: ListenItem[]; at: number };

const MAX_SEARCHES = 30;
const MAX_LISTENS = 15;

type Stored = { searches: SearchEntry[]; listens: ListenEntry[] };
const EMPTY: Stored = { searches: [], listens: [] };

const storageKey = (userKey: string) => `shosu-history-v1:${userKey}`;

function parse(raw: string | null): Stored {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<Stored>;
    const searches = (Array.isArray(data.searches) ? data.searches : [])
      .filter((e): e is SearchEntry => typeof e?.q === "string" && e.q.length > 0 && typeof e.at === "number")
      .map((e) => ({ q: e.q.slice(0, 200), mode: String(e.mode ?? "all"), status: String(e.status ?? "all"), at: e.at }))
      .slice(0, MAX_SEARCHES);
    const listens = (Array.isArray(data.listens) ? data.listens : [])
      .filter((e): e is ListenEntry => typeof e?.summary === "string" && typeof e.at === "number" && Array.isArray(e.items))
      .map((e) => ({
        summary: e.summary.slice(0, 600),
        at: e.at,
        items: e.items
          .filter((i) => Number.isInteger(i?.id))
          .slice(0, 4)
          .map((i) => ({ id: i.id, title: String(i.title ?? "").slice(0, 100), artist: String(i.artist ?? "").slice(0, 80) })),
      }))
      .slice(0, MAX_LISTENS);
    return { searches, listens };
  } catch {
    return EMPTY;
  }
}

type HistoryApi = {
  loaded: boolean;
  searches: SearchEntry[];
  listens: ListenEntry[];
  addSearch: (entry: { q: string; mode: string; status: string }) => void;
  removeSearch: (at: number) => void;
  clearSearches: () => void;
  addListen: (entry: { summary: string; items: ListenItem[] }) => void;
  removeListen: (at: number) => void;
  clearListens: () => void;
};

const noop = () => {};
const HistoryContext = createContext<HistoryApi>({
  loaded: false,
  searches: [],
  listens: [],
  addSearch: noop,
  removeSearch: noop,
  clearSearches: noop,
  addListen: noop,
  removeListen: noop,
  clearListens: noop,
});

export function HistoryProvider({ userKey, children }: { userKey: string; children: ReactNode }) {
  const [data, setData] = useState<Stored>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  // Lecture au montage (le serveur n'a pas de localStorage) et à chaque changement fait dans un autre onglet.
  useEffect(() => {
    const read = () => {
      try {
        setData(parse(localStorage.getItem(storageKey(userKey))));
      } catch {
        setData(EMPTY);
      }
    };
    read();
    loadedRef.current = true;
    setLoaded(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(userKey)) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userKey]);

  const update = useCallback(
    (change: (current: Stored) => Stored) => {
      setData((state) => {
        // Avant la première lecture, `state` est vide : on part de ce qui est vraiment stocké pour ne rien écraser.
        let current = state;
        if (!loadedRef.current) {
          try {
            current = parse(localStorage.getItem(storageKey(userKey)));
          } catch {
            /* stockage indisponible */
          }
        }
        const next = change(current);
        try {
          localStorage.setItem(storageKey(userKey), JSON.stringify(next));
        } catch {
          /* stockage plein ou bloqué : l'historique reste valable pour cette page */
        }
        return next;
      });
    },
    [userKey],
  );

  const api = useMemo<HistoryApi>(
    () => ({
      loaded,
      searches: data.searches,
      listens: data.listens,
      addSearch: ({ q, mode, status }) => {
        const text = q.trim().slice(0, 200);
        if (text.length < 2) return;
        update((c) => ({
          ...c,
          searches: [
            { q: text, mode, status, at: Date.now() },
            ...c.searches.filter((e) => !(e.q.toLowerCase() === text.toLowerCase() && e.mode === mode && e.status === status)),
          ].slice(0, MAX_SEARCHES),
        }));
      },
      removeSearch: (at) => update((c) => ({ ...c, searches: c.searches.filter((e) => e.at !== at) })),
      clearSearches: () => update((c) => ({ ...c, searches: [] })),
      addListen: ({ summary, items }) => {
        const text = summary.trim();
        if (!text && items.length === 0) return;
        update((c) => ({
          ...c,
          listens: [{ summary: text.slice(0, 600), items: items.slice(0, 4), at: Date.now() }, ...c.listens].slice(0, MAX_LISTENS),
        }));
      },
      removeListen: (at) => update((c) => ({ ...c, listens: c.listens.filter((e) => e.at !== at) })),
      clearListens: () => update((c) => ({ ...c, listens: [] })),
    }),
    [data, loaded, update],
  );

  return <HistoryContext.Provider value={api}>{children}</HistoryContext.Provider>;
}

export const useHistory = () => useContext(HistoryContext);

/** « il y a 5 min », « hier »… */
export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
}
