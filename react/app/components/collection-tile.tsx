import { Link } from "react-router";

import { Avatar } from "~/components/avatar";
import { collectionPath, type Collection } from "~/lib/collections";
import { coverUrl } from "~/lib/osu";

/** Vignette d'une collection publique : couverture, nom, propriétaire, nombre de beatmaps. */
export function CollectionTile({ collection, showOwner = true }: { collection: Collection; showOwner?: boolean }) {
  return (
    <Link className="collection-tile" to={collectionPath(collection.id)}>
      <div className="tile-cover">
        {collection.coverId ? (
          <img src={coverUrl(collection.coverId)} alt="" loading="lazy" width={320} height={120} />
        ) : (
          <span aria-hidden>📁</span>
        )}
      </div>
      <div className="tile-body">
        <strong>{collection.name}</strong>
        <span>
          {showOwner && collection.ownerName ? (
            <>
              <Avatar id={collection.ownerId} name={collection.ownerName} size={16} className="tile-avatar" /> par{" "}
              <b translate="no">{collection.ownerName}</b> ·{" "}
            </>
          ) : null}
          {collection.count} beatmap{collection.count > 1 ? "s" : ""}
        </span>
        {collection.description && <small>{collection.description}</small>}
      </div>
    </Link>
  );
}
