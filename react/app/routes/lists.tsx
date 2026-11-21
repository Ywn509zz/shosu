import { Link } from "react-router";

import { BeatmapCard } from "~/components/beatmap-card";
import { isListId, LIST_IDS, LIST_LABELS, type ListId, type ListItem } from "~/lib/lists";
import { useLists } from "~/lib/lists-context";
import { getListItems } from "~/lib/lists.server";
import { getUser } from "~/lib/session.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/lists";

export const meta: Route.MetaFunction = () => [{ title: "Mes listes — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const requested = new URL(request.url).searchParams.get("list");
  const list: ListId = isListId(requested) ? requested : "favorites";

  if (!user?.osuId) return { signedIn: false as const, list, items: [] as ListItem[], persistent: true, unavailable: false };

  try {
    return {
      signedIn: true as const,
      list,
      items: await getListItems(user.osuId, list),
      persistent: isPersistent(),
      unavailable: false,
    };
  } catch {
    return { signedIn: true as const, list, items: [] as ListItem[], persistent: isPersistent(), unavailable: true };
  }
}

export default function Lists({ loaderData }: Route.ComponentProps) {
  const { signedIn, list, items, persistent, unavailable } = loaderData;
  const lists = useLists();

  // Une beatmap retirée depuis cette page disparaît tout de suite, sans recharger.
  const visible = items.filter((item) => !lists.loaded || lists.has(list, item.id));

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">MES LISTES</p>
        <h1>Tes beatmaps à garder sous la main.</h1>
        <p>Ajoute des beatmaps en favoris ou à jouer plus tard depuis les résultats, Stack ou la page d'une map.</p>
      </section>

      {!signedIn ? (
        <div className="empty">
          <p>Connecte-toi avec osu! pour retrouver tes listes.</p>
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      ) : (
        <>
          <nav className="tabs" aria-label="Listes">
            {LIST_IDS.map((id) => (
              <Link key={id} className={`tab${id === list ? " is-active" : ""}`} to={`?list=${id}`} aria-current={id === list ? "page" : undefined}>
                {id === "favorites" ? "♥ " : "🕒 "}
                {LIST_LABELS[id]}
              </Link>
            ))}
          </nav>

          {!persistent && (
            <p className="notice">
              Le stockage des listes est temporaire sur ce site : elles peuvent disparaître lors d'un redéploiement. Une base
              Upstash doit être configurée pour les conserver (voir le README).
            </p>
          )}
          {unavailable && <p className="notice">Les listes sont momentanément indisponibles. Réessaie dans un instant.</p>}

          {visible.length === 0 && !unavailable ? (
            <p className="empty">
              Cette liste est vide. Lance une <Link to="/">recherche</Link> et ajoute des beatmaps avec ♡ ou 🕒.
            </p>
          ) : (
            <div className="results-grid">
              {visible.map((item) => (
                <BeatmapCard key={item.id} mapset={item} queue={visible} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
