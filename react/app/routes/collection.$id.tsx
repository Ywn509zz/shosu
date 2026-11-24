import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { Link, data, useNavigate } from "react-router";

import { BeatmapCard } from "~/components/beatmap-card";
import { ExportMenu } from "~/components/export-menu";
import { COLLECTION_ID_PATTERN, collectionPath, type Collection } from "~/lib/collections";
import { callCollections } from "~/lib/collections-client";
import { getCollection, getCollectionItems } from "~/lib/collections.server";
import type { ListItem } from "~/lib/lists";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/collection.$id";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!COLLECTION_ID_PATTERN.test(params.id)) throw data(null, { status: 404 });

  // Page publique : un compteur par instance protège la base (aucune commande Redis pour cette limite).
  const hit = await rateLimit(`collection:${clientIp(request)}`, 60, 60_000, false);
  if (!hit.ok) throw data(null, { status: 429, statusText: "Trop de requêtes, réessaie dans un instant." });

  const user = await getUser(request);
  try {
    const collection = await getCollection(params.id);
    const isOwner = Boolean(collection && user?.osuId === collection.ownerId);
    // Une collection privée est introuvable pour tout autre que son propriétaire.
    if (!collection || (!collection.public && !isOwner)) throw data(null, { status: 404 });
    const items = await getCollectionItems(params.id);
    return { collection, items, isOwner, signedIn: Boolean(user?.osuId) };
  } catch (error) {
    if (error instanceof Response || (typeof error === "object" && error !== null && "init" in error)) throw error;
    console.error("Collection page error:", error instanceof Error ? error.name : "Error");
    throw data(null, { status: 503, statusText: "Les collections sont momentanément indisponibles." });
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.collection.name} — shOsu!` },
        {
          name: "description",
          content: `Collection de ${loaderData.collection.ownerName || "un joueur"} : ${loaderData.collection.count} beatmap(s).`,
        },
      ]
    : [{ title: "Collection — shOsu!" }];

export default function CollectionPage({ loaderData }: Route.ComponentProps) {
  const { isOwner, signedIn } = loaderData;
  const navigate = useNavigate();

  const [collection, setCollection] = useState<Collection>(loaderData.collection);
  const [items, setItems] = useState<ListItem[]>(loaderData.items);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(loaderData.collection.name);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCollection(loaderData.collection);
    setItems(loaderData.items);
    setName(loaderData.collection.name);
  }, [loaderData]);

  const shareUrl =
    typeof window === "undefined"
      ? collectionPath(collection.id)
      : `${window.location.origin}${collectionPath(collection.id)}`;

  async function run<T>(task: () => Promise<T>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const rename = () =>
    run(async () => {
      const result = await callCollections({ action: "rename", id: collection.id, name });
      if (result.ok && result.collection) {
        setCollection(result.collection);
        setEditing(false);
      } else if (!result.ok) setMessage(result.message);
    });

  const togglePublic = () =>
    run(async () => {
      const result = await callCollections({ action: "share", id: collection.id, public: !collection.public });
      if (result.ok && result.collection) setCollection(result.collection);
      else if (!result.ok) setMessage(result.message);
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm(`Supprimer la collection « ${collection.name} » ? Cette action est définitive.`)) return;
      const result = await callCollections({ action: "delete", id: collection.id });
      if (result.ok) void navigate("/lists?list=collections");
      else setMessage(result.message);
    });

  const removeItem = (setId: number) =>
    run(async () => {
      const result = await callCollections({ action: "remove", id: collection.id, setId });
      if (result.ok) {
        setItems((current) => current.filter((item) => item.id !== setId));
        if (result.collection) setCollection(result.collection);
      } else setMessage(result.message);
    });

  const clone = () =>
    run(async () => {
      const result = await callCollections({ action: "clone", id: collection.id });
      if (result.ok && result.collection) void navigate(collectionPath(result.collection.id));
      else if (!result.ok) setMessage(result.message);
    });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Copie impossible : sélectionne le lien et copie-le à la main.");
    }
  }

  async function shareNative() {
    try {
      await navigator.share({ title: collection.name, url: shareUrl });
    } catch {
      /* partage annulé */
    }
  }

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">COLLECTION</p>
        {editing ? (
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={60}
              aria-label="Nom de la collection"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" className="account-btn" isDisabled={busy || !name.trim()}>
              Enregistrer
            </Button>
            <Button className="account-btn" onPress={() => setEditing(false)}>
              Annuler
            </Button>
          </form>
        ) : (
          <h1>{collection.name}</h1>
        )}
        <p>
          {collection.ownerName ? (
            <>
              par{" "}
              <Link to={`/player/${collection.ownerId}`} translate="no">
                {collection.ownerName}
              </Link>{" "}
              ·{" "}
            </>
          ) : null}
          {items.length} beatmap{items.length > 1 ? "s" : ""}
          {isOwner && ` · ${collection.public ? "publique" : "privée"}`}
        </p>
      </section>

      <div className="collection-actions">
        <ExportMenu name={collection.name} items={items} />
        {isOwner ? (
          <>
            <Button
              className="account-btn"
              aria-pressed={collection.public}
              isDisabled={busy}
              onPress={() => void togglePublic()}
            >
              {collection.public ? "🔓 Rendre privée" : "🔗 Partager"}
            </Button>
            <Button className="account-btn" onPress={() => setEditing(true)}>
              ✎ Renommer
            </Button>
            <Button className="account-btn is-danger" isDisabled={busy} onPress={() => void remove()}>
              🗑 Supprimer
            </Button>
          </>
        ) : signedIn ? (
          <Button className="account-btn" isDisabled={busy} onPress={() => void clone()}>
            ＋ Copier dans mes collections
          </Button>
        ) : (
          <a className="account-btn" href="/api/auth/login">
            Se connecter pour la copier
          </a>
        )}
      </div>

      {isOwner && collection.public && (
        <div className="share-box" role="group" aria-label="Lien de partage">
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Lien de partage"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button className="account-btn" onPress={() => void copyLink()}>
            {copied ? "✓ Copié" : "Copier le lien"}
          </Button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button className="account-btn" onPress={() => void shareNative()}>
              Partager…
            </Button>
          )}
          <p>Toute personne qui a ce lien peut voir cette collection. Elle ne peut pas la modifier.</p>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty">
          {isOwner ? (
            <>
              Cette collection est vide. Ajoute des beatmaps avec le bouton 📁 depuis la <Link to="/">recherche</Link>.
            </>
          ) : (
            "Cette collection est vide."
          )}
        </p>
      ) : (
        <div className="results-grid">
          {items.map((item) => (
            <BeatmapCard
              key={item.id}
              mapset={item}
              queue={items}
              extra={
                isOwner ? (
                  <Button
                    className="icon-btn"
                    aria-label={`Retirer ${item.title} de la collection`}
                    isDisabled={busy}
                    onPress={() => void removeItem(item.id)}
                  >
                    <span aria-hidden>✕</span>
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
