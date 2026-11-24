import { Button } from "@heroui/react";
import { Link, useSearchParams } from "react-router";

import { searchHref } from "~/lib/assistant";
import { timeAgo, useHistory } from "~/lib/history";
import { MODE_OPTIONS, STATUS_OPTIONS } from "~/lib/osu";

import type { Route } from "./+types/history";

export const meta: Route.MetaFunction = () => [{ title: "Historique — shOsu!" }];

const label = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

export default function History() {
  const history = useHistory();
  const [params] = useSearchParams();
  const tab = params.get("tab") === "listens" ? "listens" : "searches";

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">HISTORIQUE</p>
        <h1>Ce que tu as cherché et écouté.</h1>
        <p>Gardé uniquement dans ce navigateur : rien n'est envoyé à shOsu!.</p>
      </section>

      <nav className="tabs" aria-label="Historique">
        <Link className={`tab${tab === "searches" ? " is-active" : ""}`} to="?tab=searches" aria-current={tab === "searches" ? "page" : undefined}>
          ⌕ Recherches ({history.searches.length})
        </Link>
        <Link className={`tab${tab === "listens" ? " is-active" : ""}`} to="?tab=listens" aria-current={tab === "listens" ? "page" : undefined}>
          🎧 Écoutes ({history.listens.length})
        </Link>
      </nav>

      {tab === "searches" ? (
        history.searches.length === 0 ? (
          <p className="empty">
            Aucune recherche pour l'instant. Lance une <Link to="/">recherche</Link> : elle apparaîtra ici.
          </p>
        ) : (
          <>
            <div className="history-actions">
              <Button className="account-btn" onPress={history.clearSearches}>
                Tout effacer
              </Button>
            </div>
            <ul className="history-list">
              {history.searches.map((entry) => (
                <li key={entry.at} className="history-row">
                  <Link to={searchHref(entry)} className="history-main">
                    <strong>{entry.q}</strong>
                    <small>
                      {entry.mode !== "all" && `${label(MODE_OPTIONS, entry.mode)} · `}
                      {entry.status !== "all" && `${label(STATUS_OPTIONS, entry.status)} · `}
                      {timeAgo(entry.at)}
                    </small>
                  </Link>
                  <Button className="icon-btn" aria-label={`Retirer « ${entry.q} » de l'historique`} onPress={() => history.removeSearch(entry.at)}>
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : history.listens.length === 0 ? (
        <p className="empty">
          Aucune écoute pour l'instant. Utilise le bouton 🎧 de la recherche ou de Stack pour identifier un son.
        </p>
      ) : (
        <>
          <div className="history-actions">
            <Button className="account-btn" onPress={history.clearListens}>
              Tout effacer
            </Button>
          </div>
          <ul className="history-list">
            {history.listens.map((entry) => (
              <li key={entry.at} className="history-row is-listen">
                <div className="history-main">
                  <small>{timeAgo(entry.at)}</small>
                  {entry.summary && <p>{entry.summary}</p>}
                  {entry.items.length > 0 && (
                    <div className="chips">
                      {entry.items.map((item) => (
                        <Link className="chip" key={item.id} to={`/beatmap/${item.id}`}>
                          {item.title} — {item.artist}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <Button className="icon-btn" aria-label="Retirer cette écoute de l'historique" onPress={() => history.removeListen(entry.at)}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
