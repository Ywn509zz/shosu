import { Button } from "@heroui/react";
import { Form, Link, data, useSearchParams } from "react-router";

import { CollectionTile } from "~/components/collection-tile";
import { EmptyState } from "~/components/empty-state";
import { listPublicCollections } from "~/lib/collections.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { useProgressive } from "~/lib/use-progressive";

import type { Route } from "./+types/collections";

export const meta: Route.MetaFunction = () => [
  { title: "Collections publiques — shOsu!" },
  { name: "description", content: "Découvre les collections de beatmaps partagées par d'autres joueurs." },
];

const STEP = 24;

/** Découverte des collections que d'autres joueurs ont rendues publiques. */
export async function loader({ request }: Route.LoaderArgs) {
  // Page publique qui lit Redis : compteur par instance, sans commande Redis.
  const hit = await rateLimit(`collections-page:${clientIp(request)}`, 60, 60_000, false);
  if (!hit.ok) throw data(null, { status: 429, statusText: "Trop de requêtes, réessaie dans un instant." });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const sort = url.searchParams.get("sort") === "big" ? "big" : "recent";

  try {
    const all = await listPublicCollections({ query });
    all.sort((a, b) => (sort === "big" ? b.count - a.count || b.updatedAt - a.updatedAt : b.updatedAt - a.updatedAt));
    return { collections: all.slice(0, 300), query, sort, unavailable: false };
  } catch {
    return { collections: [], query, sort, unavailable: true };
  }
}

export default function Collections({ loaderData }: Route.ComponentProps) {
  const { collections, query, sort, unavailable } = loaderData;
  const [params] = useSearchParams();
  const progressive = useProgressive(collections.length, STEP, `${query}:${sort}`);
  const link = (nextSort: string) => {
    const next = new URLSearchParams(params);
    next.set("sort", nextSort);
    return `?${next}`;
  };

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">COLLECTIONS PUBLIQUES</p>
        <h1>Les collections des autres joueurs.</h1>
        <p>
          Découvre des sélections de beatmaps partagées par la communauté, puis copie celles qui te plaisent dans tes
          collections.
        </p>
      </section>

      <Form className="collection-create" method="get" role="search">
        <input
          type="text"
          name="q"
          defaultValue={query}
          maxLength={60}
          placeholder="Chercher une collection ou un joueur…"
          aria-label="Chercher"
        />
        {sort === "big" && <input type="hidden" name="sort" value="big" />}
        <Button type="submit" className="account-btn">
          Chercher
        </Button>
      </Form>

      <nav className="tabs" aria-label="Tri">
        <Link
          className={`tab${sort === "recent" ? " is-active" : ""}`}
          to={link("recent")}
          aria-current={sort === "recent" ? "page" : undefined}
        >
          🕒 Récentes
        </Link>
        <Link
          className={`tab${sort === "big" ? " is-active" : ""}`}
          to={link("big")}
          aria-current={sort === "big" ? "page" : undefined}
        >
          📚 Les plus fournies
        </Link>
      </nav>

      {unavailable && (
        <p className="notice">Les collections sont momentanément indisponibles. Réessaie dans un instant.</p>
      )}
      {!unavailable && collections.length === 0 ? (
        <EmptyState
          icon="🌍"
          title={query ? "Aucune collection ne correspond" : "Aucune collection publique pour l'instant"}
          actions={
            <>
              <Link className="account-btn is-primary" to="/lists?list=collections">
                Créer ma collection
              </Link>
              {query && (
                <Link className="account-btn" to="/collections">
                  Voir toutes les collections
                </Link>
              )}
            </>
          }
        >
          {query
            ? "Essaie un autre mot, ou retire la recherche."
            : "Sois le premier : crée une collection, rends-la publique et partage-la."}
        </EmptyState>
      ) : (
        <div className="tile-grid">
          {collections.slice(0, progressive.count).map((collection) => (
            <CollectionTile key={collection.id} collection={collection} />
          ))}
          {!progressive.done && (
            <div className="load-more" ref={progressive.sentinel}>
              <Button className="load-more-btn" onPress={progressive.more}>
                Charger plus ({collections.length - progressive.count})
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
