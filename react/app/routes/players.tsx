import { Button } from "@heroui/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Avatar } from "~/components/avatar";
import { EmptyState } from "~/components/empty-state";
import { countryFlag, formatNumber, parsePlayerRef } from "~/lib/osu";
import { getRankings } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import {
  RANKING_COUNTRIES,
  RANKING_MAX_PAGE,
  RANKING_MODES,
  RANKING_PAGE_SIZE,
  parseRankingParams,
  rankingHref,
} from "~/lib/rankings";

import type { Route } from "./+types/players";

export const meta: Route.MetaFunction = () => [
  { title: "Joueurs osu! — shOsu!" },
  { name: "description", content: "Classement des joueurs osu! par mode et par pays, avec recherche et comparaison." },
];

/** /players?mode=osu&country=FR&page=2 : classement des joueurs osu! (50 par page). */
export async function loader({ request }: Route.LoaderArgs) {
  // Page publique : compteur par instance (aucune commande Redis) ; osu! est déjà mis en cache 5 min par page.
  const hit = await rateLimit(`players:${clientIp(request)}`, 60, 60_000, false);
  if (!hit.ok) throw new Response(null, { status: 429, statusText: "Trop de requêtes, réessaie dans un instant." });

  const params = parseRankingParams(new URL(request.url).searchParams);
  try {
    const { players, total } = await getRankings({ ...params, size: RANKING_PAGE_SIZE });
    return { ...params, players, total, error: false };
  } catch (error) {
    console.error("Players page error:", error instanceof Error ? error.name : "Error");
    return { ...params, players: [], total: null, error: true };
  }
}

/** Accepte un pseudo, un identifiant ou un lien osu! (…/users/123). */
function parseRef(value: string): string | null {
  const text = value.trim();
  const url = /users\/([^/?#\s]+)/.exec(text);
  let ref = text;
  try {
    ref = decodeURIComponent(url ? url[1] : text);
  } catch {
    return null;
  }
  return parsePlayerRef(ref) ? ref : null;
}

export default function Players({ loaderData }: Route.ComponentProps) {
  const { mode, country, page, players, total, error } = loaderData;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");

  const countryName = RANKING_COUNTRIES.find(([code]) => code === country)?.[1] ?? country;
  const hasNext = players.length === RANKING_PAGE_SIZE && page < RANKING_MAX_PAGE;

  function find(e: React.FormEvent) {
    e.preventDefault();
    const ref = parseRef(query);
    if (!ref) {
      setFormError("Entre un pseudo, un identifiant ou un lien osu! (osu.ppy.sh/users/…).");
      return;
    }
    setFormError("");
    void navigate(`/player/${encodeURIComponent(ref)}?mode=${mode}`);
  }

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">JOUEURS</p>
        <h1>Joueurs osu!</h1>
        <p>
          Le classement {country ? `de ${countryName}` : "mondial"} en performance (pp)
          {total ? ` · ${formatNumber(total)} joueurs classés` : ""}. Clique sur un joueur pour voir son profil.
        </p>
      </section>

      <form className="compare-form players-find" onSubmit={find}>
        <input
          type="text"
          value={query}
          placeholder="Trouver un joueur : pseudo, id ou lien osu!"
          aria-label="Trouver un joueur"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" className="account-btn is-primary">
          Voir le profil
        </Button>
        <Link className="account-btn" to="/compare/players">
          ⚖ Comparer deux joueurs
        </Link>
      </form>
      {formError && (
        <p className="notice" role="alert">
          {formError}
        </p>
      )}

      <nav className="tabs" aria-label="Mode de jeu">
        {RANKING_MODES.map((m) => (
          <Link
            key={m.id}
            className={`tab${mode === m.id ? " is-active" : ""}`}
            to={rankingHref({ mode: m.id, country, page: 1 })}
            aria-current={mode === m.id ? "page" : undefined}
            translate="no"
          >
            {m.label}
          </Link>
        ))}
      </nav>

      <nav className="tabs players-countries" aria-label="Pays">
        <Link
          className={`tab${country === "" ? " is-active" : ""}`}
          to={rankingHref({ mode, country: "", page: 1 })}
          aria-current={country === "" ? "page" : undefined}
        >
          🌍 Monde
        </Link>
        {RANKING_COUNTRIES.map(([code, name]) => (
          <Link
            key={code}
            className={`tab${country === code ? " is-active" : ""}`}
            to={rankingHref({ mode, country: code, page: 1 })}
            aria-current={country === code ? "page" : undefined}
            title={name}
          >
            {countryFlag(code)} {code}
          </Link>
        ))}
        {country && !RANKING_COUNTRIES.some(([code]) => code === country) && (
          <span className="tab is-active" aria-current="page">
            {countryFlag(country)} {country}
          </span>
        )}
      </nav>

      {error ? (
        <EmptyState icon="⚠" tone="error" title="Classement indisponible">
          osu! ne répond pas pour le moment : réessaie dans un instant.
        </EmptyState>
      ) : players.length === 0 ? (
        <EmptyState
          icon="👤"
          title="Aucun joueur ici"
          actions={
            <Link className="account-btn" to={rankingHref({ mode, country: "", page: 1 })}>
              Voir le classement mondial
            </Link>
          }
        >
          Ce classement est vide : le pays n'existe peut-être pas ou personne n'est classé dans ce mode.
        </EmptyState>
      ) : (
        <div className="players-table" role="table" aria-label="Classement des joueurs">
          <div className="players-row is-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Joueur</span>
            <span role="columnheader">pp</span>
            <span role="columnheader" className="players-extra">
              Précision
            </span>
            <span role="columnheader" className="players-extra">
              Parties
            </span>
            <span role="columnheader" className="players-action" aria-label="Actions" />
          </div>
          {players.map((player, index) => {
            const rank = country ? player.countryRank : player.globalRank;
            return (
              <div className="players-row" role="row" key={player.id}>
                <b role="cell" className="players-rank">
                  {rank ?? (page - 1) * RANKING_PAGE_SIZE + index + 1}
                </b>
                <Link role="cell" className="players-name" to={`/player/${player.id}?mode=${mode}`} translate="no">
                  <Avatar id={player.id} name={player.username} size={32} />
                  <span>
                    {countryFlag(player.country)} {player.username}
                  </span>
                </Link>
                <span role="cell">{player.pp !== null ? formatNumber(player.pp) : "–"}</span>
                <span role="cell" className="players-extra">
                  {player.accuracy !== null ? `${player.accuracy.toFixed(2)} %` : "–"}
                </span>
                <span role="cell" className="players-extra">
                  {player.playCount !== null ? formatNumber(player.playCount) : "–"}
                </span>
                <Link
                  role="cell"
                  className="players-action"
                  to={`/compare/players?a=${player.id}&mode=${mode}`}
                  aria-label={`Comparer ${player.username} avec un autre joueur`}
                >
                  ⚖
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {!error && (page > 1 || hasNext) && (
        <nav className="players-pager" aria-label="Pages du classement">
          {page > 1 ? (
            <Link className="account-btn" to={rankingHref({ mode, country, page: page - 1 })}>
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} · rangs {(page - 1) * RANKING_PAGE_SIZE + 1} à {(page - 1) * RANKING_PAGE_SIZE + players.length}
          </span>
          {hasNext ? (
            <Link className="account-btn" to={rankingHref({ mode, country, page: page + 1 })}>
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
