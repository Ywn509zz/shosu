import { Button } from "@heroui/react";
import { useState } from "react";

import { BeatmapCard } from "~/components/beatmap-card";
import type { DiscoveryLens } from "~/lib/osu";

const PAGE = 6;

/**
 * Suggestions sous la recherche : plus jouées, récentes, plus aimées, ou une sélection surprise.
 * Chaque rangée contient 18 beatmaps tirées au hasard côté serveur ; « Autres suggestions »
 * fait défiler les 6 suivantes.
 */
export function Discovery({ lenses }: { lenses: DiscoveryLens[] }) {
  const [active, setActive] = useState(lenses[0]?.id ?? "");
  const [pages, setPages] = useState<Record<string, number>>({});

  const lens = lenses.find((l) => l.id === active) ?? lenses[0];
  if (!lens) return null;

  const pageCount = Math.max(1, Math.ceil(lens.items.length / PAGE));
  const page = (pages[lens.id] ?? 0) % pageCount;
  const shown = lens.items.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <section className="discover" aria-label="Suggestions de beatmaps">
      <p className="eyebrow">À DÉCOUVRIR</p>
      <div className="tabs" role="tablist" aria-label="Type de suggestions">
        {lenses.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === lens.id}
            className={`tab${l.id === lens.id ? " is-active" : ""}`}
            onClick={() => setActive(l.id)}
          >
            {l.title}
          </button>
        ))}
      </div>

      <div className="results-grid">
        {shown.map((mapset) => (
          <BeatmapCard key={mapset.id} mapset={mapset} queue={shown} />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="discover-more">
          <Button className="discover-btn" onPress={() => setPages((prev) => ({ ...prev, [lens.id]: page + 1 }))}>
            🔄 Autres suggestions
          </Button>
        </div>
      )}
    </section>
  );
}
