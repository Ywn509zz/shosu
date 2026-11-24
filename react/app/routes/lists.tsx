import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { BeatmapCard } from "~/components/beatmap-card";
import { ExportMenu } from "~/components/export-menu";
import { callCollections } from "~/lib/collections-client";
import { collectionPath, type Collection } from "~/lib/collections";
import { listCollections } from "~/lib/collections.server";
import { isListId, LIST_IDS, LIST_LABELS, type ListId, type ListItem } from "~/lib/lists";
import { useLists } from "~/lib/lists-context";
import { getListItems } from "~/lib/lists.server";
import { PLANS, type PlanId } from "~/lib/plans";
import { useProgressive } from "~/lib/use-progressive";
import { getUser } from "~/lib/session.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/lists";

const PAGE_SIZE = 24;

export const meta: Route.MetaFunction = () => [{ title: "Mes listes — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const requested = new URL(request.url).searchParams.get("list");
  const view: "collections" | ListId =
    requested === "collections" ? "collections" : isListId(requested) ? requested : "favorites";
  const list: ListId = view === "collections" ? "favorites" : view;

  const none = { plan: "free" as PlanId, limit: PLANS.free.listLimit, collectionLimit: PLANS.free.collectionLimit };
  const noCollections = [] as Collection[];
  if (!user?.osuId) {
    return {
      signedIn: false as const,
      ...none,
      view,
      list,
      items: [] as ListItem[],
      collections: noCollections,
      persistent: true,
      unavailable: false,
    };
  }

  const base = {
    signedIn: true as const,
    plan: user.plan,
    limit: PLANS[user.plan].listLimit,
    collectionLimit: PLANS[user.plan].collectionLimit,
    view,
    list,
    persistent: isPersistent(),
  };
  try {
    return view === "collections"
      ? { ...base, items: [] as ListItem[], collections: await listCollections(user.osuId), unavailable: false }
      : { ...base, items: await getListItems(user.osuId, list), collections: noCollections, unavailable: false };
  } catch {
    return { ...base, items: [] as ListItem[], collections: noCollections, unavailable: true };
  }
}

export default function Lists({ loaderData }: Route.ComponentProps) {
  const { signedIn, plan, limit, collectionLimit, view, list, items, collections, persistent, unavailable } =
    loaderData;
  const lists = useLists();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [sharing, setSharing] = useState(false);

  /** Copie la liste dans une collection publique (instantané) et ouvre sa page, où se trouve le lien à partager. */
  async function shareList() {
    if (sharing) return;
    setSharing(true);
    setCreateError("");
    const result = await callCollections({ action: "from_list", list });
    setSharing(false);
    if (result.ok && result.collection) void navigate(collectionPath(result.collection.id));
    else if (!result.ok) setCreateError(result.message);
  }

  async function createCollection() {
    if (creating || !newName.trim()) return;
    setCreating(true);
    setCreateError("");
    const result = await callCollections({ action: "create", name: newName });
    setCreating(false);
    if (result.ok && result.collection) void navigate(collectionPath(result.collection.id));
    else if (!result.ok) setCreateError(result.message);
  }

  // Une beatmap retirée depuis cette page disparaît tout de suite, sans recharger.
  const visible = items.filter((item) => !lists.loaded || lists.has(list, item.id));

  // Les listes Premium peuvent être longues : on affiche 60 cartes à la fois.
  // Chargement progressif : 24 cartes, puis 24 de plus à chaque fois que le bas de la liste approche.
  const progressive = useProgressive(visible.length, PAGE_SIZE, `${list}:${view}`);

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">MES LISTES</p>
        <h1>Tes beatmaps à garder sous la main.</h1>
        <p>
          Ajoute des beatmaps en favoris ou à jouer plus tard, ou range-les dans des collections que tu peux partager
          avec un lien.
        </p>
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
              <Link
                key={id}
                className={`tab${view === id ? " is-active" : ""}`}
                to={`?list=${id}`}
                aria-current={view === id ? "page" : undefined}
              >
                {id === "favorites" ? "♥ " : "🕒 "}
                {LIST_LABELS[id]}
              </Link>
            ))}
            <Link
              className={`tab${view === "collections" ? " is-active" : ""}`}
              to="?list=collections"
              aria-current={view === "collections" ? "page" : undefined}
            >
              📁 Mes collections
            </Link>
          </nav>

          <p className="plan-usage">
            {view === "collections"
              ? `${collections.length} / ${collectionLimit} collections`
              : `${visible.length} / ${limit} beatmaps dans cette liste`}{" "}
            · plan {PLANS[plan].label}
            {plan === "free" && (
              <>
                {" "}
                · <Link to="/premium">Voir le plan Premium</Link>
              </>
            )}
          </p>

          {!persistent && (
            <p className="notice">
              Le stockage des listes est temporaire sur ce site : elles peuvent disparaître lors d'un redéploiement. Une
              base Upstash doit être configurée pour les conserver (voir le README).
            </p>
          )}
          {unavailable && (
            <p className="notice">Les listes sont momentanément indisponibles. Réessaie dans un instant.</p>
          )}

          {view === "collections" ? (
            <>
              <form
                className="collection-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createCollection();
                }}
              >
                <input
                  type="text"
                  value={newName}
                  maxLength={60}
                  placeholder={
                    collections.length >= collectionLimit
                      ? "Limite de collections atteinte"
                      : "Nom de la nouvelle collection…"
                  }
                  aria-label="Nom de la nouvelle collection"
                  disabled={creating || collections.length >= collectionLimit}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button
                  type="submit"
                  className="account-btn"
                  isDisabled={creating || !newName.trim() || collections.length >= collectionLimit}
                >
                  ＋ Créer
                </Button>
              </form>
              {createError && <p className="notice">{createError}</p>}
              {collections.length === 0 && !unavailable ? (
                <p className="empty">
                  Aucune collection pour l'instant. Crée-en une ci-dessus, puis ajoute des beatmaps avec le bouton 📁.
                </p>
              ) : (
                <div className="collection-grid">
                  {collections.map((collection) => (
                    <Link className="collection-card" key={collection.id} to={collectionPath(collection.id)}>
                      <strong>{collection.name}</strong>
                      <span>
                        {collection.count} beatmap{collection.count > 1 ? "s" : ""}
                      </span>
                      <small>{collection.public ? "🔗 Partagée" : "🔒 Privée"}</small>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : visible.length === 0 && !unavailable ? (
            <p className="empty">
              Cette liste est vide. Lance une <Link to="/">recherche</Link> et ajoute des beatmaps avec ♡ ou 🕒.
            </p>
          ) : (
            <>
              <div className="collection-actions">
                <ExportMenu name={LIST_LABELS[list]} items={visible} />
                <Button className="account-btn" isDisabled={sharing} onPress={() => void shareList()}>
                  🔗 Partager cette liste
                </Button>
              </div>
              {createError && <p className="notice">{createError}</p>}
              <div className="results-grid">
                {visible.slice(0, progressive.count).map((item) => (
                  <BeatmapCard key={item.id} mapset={item} queue={visible} />
                ))}
                {!progressive.done && (
                  <div className="load-more" ref={progressive.sentinel}>
                    <Button className="load-more-btn" onPress={progressive.more}>
                      Charger plus ({visible.length - progressive.count})
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
