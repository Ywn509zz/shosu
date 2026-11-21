import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { ListId } from "./lists";

type Ids = Record<ListId, Set<number>>;

type ListsApi = {
  signedIn: boolean;
  loaded: boolean;
  /** Faux si le stockage est temporaire (aucune base configurée côté serveur). */
  persistent: boolean;
  /** Dernier message d'erreur à afficher (liste pleine, réseau…), puis effacé. */
  error: string;
  has: (list: ListId, id: number) => boolean;
  toggle: (list: ListId, id: number) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
};

const empty = (): Ids => ({ favorites: new Set(), later: new Set() });

const ListsContext = createContext<ListsApi>({
  signedIn: false,
  loaded: false,
  persistent: true,
  error: "",
  has: () => false,
  toggle: async () => {},
  refresh: async () => {},
  clearError: () => {},
});

const ERRORS: Record<string, string> = {
  list_full: "Cette liste est pleine. Le plan Premium permet d'en garder beaucoup plus.",
  beatmap_not_found: "Impossible de retrouver cette beatmap chez osu!.",
  rate_limited: "Trop d'actions d'affilée. Patiente un instant.",
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu!.",
};

export function ListsProvider({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const [ids, setIds] = useState<Ids>(empty);
  const [loaded, setLoaded] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState("");
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const response = await fetch("/api/lists", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const body = (await response.json()) as { persistent: boolean; lists: Record<ListId, number[]> };
      setIds({ favorites: new Set(body.lists.favorites), later: new Set(body.lists.later) });
      setPersistent(body.persistent);
      setLoaded(true);
    } catch {
      /* hors ligne : les boutons restent inactifs */
    }
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) void refresh();
    else {
      setIds(empty());
      setLoaded(false);
    }
  }, [signedIn, refresh]);

  const toggle = useCallback(async (list: ListId, id: number) => {
    const had = idsRef.current[list].has(id);

    // Mise à jour immédiate de l'interface, annulée si le serveur refuse.
    const apply = (present: boolean) =>
      setIds((prev) => {
        const next = new Set(prev[list]);
        if (present) next.add(id);
        else next.delete(id);
        return { ...prev, [list]: next };
      });
    apply(!had);

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: had ? "remove" : "add", list, id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        apply(had);
        setError(ERRORS[body?.error ?? ""] ?? "Impossible de modifier la liste pour le moment.");
      }
    } catch {
      apply(had);
      setError("Impossible de modifier la liste pour le moment.");
    }
  }, []);

  const api = useMemo<ListsApi>(
    () => ({
      signedIn,
      loaded,
      persistent,
      error,
      has: (list, id) => ids[list].has(id),
      toggle,
      refresh,
      clearError: () => setError(""),
    }),
    [signedIn, loaded, persistent, error, ids, toggle, refresh],
  );

  return <ListsContext.Provider value={api}>{children}</ListsContext.Provider>;
}

export const useLists = () => useContext(ListsContext);
