import { Button } from "@heroui/react";

import { LIST_LABELS, type ListId } from "~/lib/lists";
import { useLists } from "~/lib/lists-context";

const ICONS: Record<ListId, { off: string; on: string }> = {
  favorites: { off: "♡", on: "♥" },
  later: { off: "🕒", on: "✅" },
};

/** Boutons « Favoris » et « À jouer plus tard » d'une beatmap (visibles une fois connecté). */
export function ListButtons({ id }: { id: number }) {
  const lists = useLists();
  if (!lists.signedIn) return null;

  return (
    <>
      {(["favorites", "later"] as const).map((list) => {
        const on = lists.has(list, id);
        const label = on ? `Retirer des ${LIST_LABELS[list].toLowerCase()}` : `Ajouter aux ${LIST_LABELS[list].toLowerCase()}`;
        return (
          <Button
            key={list}
            className={`icon-btn${on ? " is-on" : ""}`}
            aria-pressed={on}
            aria-label={label}
            isDisabled={!lists.loaded}
            onPress={() => void lists.toggle(list, id)}
          >
            <span aria-hidden>{on ? ICONS[list].on : ICONS[list].off}</span>
          </Button>
        );
      })}
    </>
  );
}
