import { Button } from "@heroui/react";
import { Link, useSearchParams } from "react-router";

import { searchHref } from "~/lib/assistant";
import { timeAgo, useHistory } from "~/lib/history";
import { coverUrl, MODE_OPTIONS, STATUS_OPTIONS } from "~/lib/osu";

import type { Route } from "./+types/history";

export const meta: Route.MetaFunction = () => [{ title: "Historique — shOsu!" }];

const label = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

export default function History() {
  const history = useHistory();
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const tab = requested === "listens" ? "listens" : requested === "views" ? "views" : "searches";

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
        <Link className={`tab${tab === "views" ? " is-active" : ""}`} to="?tab=views" aria-current={tab === "views" ? "page" : undefined}>
          👁 Consultées ({history.views.length})
        </Link>
        <Link className={`tab${tab === "listens" ? " is-active" : ""}`} to="?tab=listens" aria-current={tab === "listens" ? "page" : undefined}>
          🎧 Écoutes ({history.listens.length})
        </Link>
      </nav>

      {tab === "views" ? (
        history.views.length === 0 ? (
          <p className="empty">
            Aucune beatmap consultée pour l'instant. Ouvre la page d'une beatmap depuis une <Link to="/">recherche</Link> : elle apparaîtra ici.
          </p>
        ) : (
          <>
            <div className="history-actions">
              <Button className="account-btn" onPress={history.clearViews}>
                Tout effacer
              </Button>
            </div>
            <ul className="history-list">
              {history.views.map((entry) => (
                <li key={entry.id} className="history-row">
                  <img className="history-cover" src={coverUrl(entry.id)} alt="" loading="lazy" width={48} height={48} />
                  <Link to={`/beatmap/${entry.id}`} className="history-main">
                    <strong>{entry.title || `Beatmap ${entry.id}`}</strong>
                    <small>
                      {entry.artist ? `${entry.artist} · ` : ""}
                      {timeAgo(entry.at)}
                    </small>
                  </Link>
                  <Button className="icon-btn" aria-label={`Retirer ${entry.title} de l'historique`} onPress={() => history.removeView(entry.id)}>
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : tab === "searches" ? (
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
