import { Button } from "@heroui/react";
import { useState } from "react";
import { Link, useNavigate, useRouteLoaderData } from "react-router";

import { Avatar } from "~/components/avatar";
import { comparePlayers } from "~/lib/compare-players";
import { countryFlag, coverUrl, formatNumber, parsePlayerRef, type PlayerPage } from "~/lib/osu";
import { OsuError, getPlayerPage } from "~/lib/osu.server";
import { getProgress } from "~/lib/progress.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import type { ModeSummary } from "~/lib/insights";

import type { loader as layoutLoader } from "./layout";
import type { Route } from "./+types/compare-players";

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData?.a && loaderData?.b
    ? [{ title: `${loaderData.a.username} contre ${loaderData.b.username} — shOsu!` }]
    : [{ title: "Comparer deux joueurs — shOsu!" }];

const MODES = [
  { id: "osu", label: "Standard" },
  { id: "taiko", label: "Taiko" },
  { id: "fruits", label: "fruits" },
  { id: "mania", label: "Mania" },
];

async function load(
  ref: string | null,
  mode: string,
): Promise<{ player: PlayerPage | null; modes?: ModeSummary[]; error: string | null }> {
  if (!ref) return { player: null, error: null };
  if (!parsePlayerRef(ref))
    return { player: null, error: `« ${ref.slice(0, 30)} » n'est pas un pseudo ou un identifiant osu! valide.` };
  try {
    const player = await getPlayerPage(ref, mode);
    const modes = await getProgress(player.id, mode)
      .then((p) => p.modes)
      .catch(() => undefined);
    return { player, modes, error: null };
  } catch (error) {
    if (error instanceof OsuError && error.status === 404)
      return { player: null, error: `Le joueur « ${ref.slice(0, 30)} » n'existe pas.` };
    return { player: null, error: "osu! est momentanément indisponible." };
  }
}

/** /compare/players?a=<pseudo ou id>&b=<pseudo ou id>&mode=osu : deux joueurs côte à côte. */
export async function loader({ request }: Route.LoaderArgs) {
  const hit = await rateLimit(`compare-players:${clientIp(request)}`, 30, 60_000, false);
  if (!hit.ok) throw new Response(null, { status: 429, statusText: "Trop de requêtes, réessaie dans un instant." });

  const params = new URL(request.url).searchParams;
  const mode = MODES.find((m) => m.id === params.get("mode"))?.id ?? "osu";
  const [first, second] = await Promise.all([load(params.get("a"), mode), load(params.get("b"), mode)]);

  return {
    mode,
    a: first.player,
    b: second.player,
    error: first.error ?? second.error,
    comparison:
      first.player && second.player ? comparePlayers(first.player, second.player, first.modes, second.modes) : null,
  };
}

/** Accepte un pseudo, un identifiant ou un lien osu! (…/users/123) : renvoie ce qu'il faut pour la page. */
function parseRef(value: string): string | null {
  const text = value.trim();
  const url = /users\/([^/?#\s]+)/.exec(text);
  const ref = decodeURIComponent(url ? url[1] : text);
  return parsePlayerRef(ref) ? ref : null;
}

export default function ComparePlayers({ loaderData }: Route.ComponentProps) {
  const { mode, a, b, error, comparison } = loaderData;
  const navigate = useNavigate();
  const me = useRouteLoaderData<typeof layoutLoader>("routes/layout")?.user;
  const [inputA, setInputA] = useState(a ? a.username : "");
  const [inputB, setInputB] = useState(b ? b.username : "");
  const [formError, setFormError] = useState("");

  const go = (refA: string, refB: string, nextMode = mode) =>
    void navigate(`/compare/players?a=${encodeURIComponent(refA)}&b=${encodeURIComponent(refB)}&mode=${nextMode}`);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const refA = parseRef(inputA);
    const refB = parseRef(inputB);
    if (!refA || !refB) {
      setFormError("Entre un pseudo, un identifiant ou un lien osu! (osu.ppy.sh/users/…) pour chaque joueur.");
      return;
    }
    setFormError("");
    go(refA, refB);
  }

  const side = (player: PlayerPage | null, which: "a" | "b") =>
    player ? (
      <article className={`compare-side is-${which}`}>
        <Avatar id={player.id} name={player.username} size={72} />
        <div>
          <Link to={`/player/${player.id}?mode=${mode}`} translate="no">
            {countryFlag(player.country)} {player.username}
          </Link>
          <p>
            {player.globalRank
              ? `#${formatNumber(player.globalRank)} mondial`
              : player.hasStats
                ? "Non classé"
                : "Pas de statistiques dans ce mode"}
          </p>
          <small>
            {player.pp !== null ? `${formatNumber(player.pp)} pp` : ""}
            {player.accuracy !== null && player.hasStats ? ` · ${player.accuracy.toFixed(2)} %` : ""}
          </small>
        </div>
      </article>
    ) : (
      <article className="compare-side is-empty">
        <p>{which === "a" ? "Joueur A" : "Joueur B"} : à choisir.</p>
      </article>
    );

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">COMPARAISON</p>
        <h1>Comparer deux joueurs</h1>
        <p>Statistiques, style de jeu, modes préférés et beatmaps en commun.</p>
      </section>

      <nav className="tabs" aria-label="Type de comparaison">
        <Link className="tab" to="/compare">
          Beatmaps
        </Link>
        <Link className="tab is-active" to="/compare/players" aria-current="page">
          Joueurs
        </Link>
      </nav>

      <nav className="tabs" aria-label="Mode de jeu">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`tab${mode === m.id ? " is-active" : ""}`}
            aria-pressed={mode === m.id}
            translate="no"
            onClick={() => {
              const refA = a ? String(a.id) : parseRef(inputA);
              const refB = b ? String(b.id) : parseRef(inputB);
              if (refA && refB) go(refA, refB, m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <form className="compare-form" onSubmit={submit}>
        <input
          type="text"
          value={inputA}
          placeholder="Joueur A : pseudo, id ou lien osu!"
          aria-label="Joueur A"
          onChange={(e) => setInputA(e.target.value)}
        />
        <span aria-hidden>⚖</span>
        <input
          type="text"
          value={inputB}
          placeholder="Joueur B : pseudo, id ou lien osu!"
          aria-label="Joueur B"
          onChange={(e) => setInputB(e.target.value)}
        />
        <Button type="submit" className="account-btn is-primary">
          Comparer
        </Button>
        {a && b && (
          <Button className="account-btn" onPress={() => go(String(b.id), String(a.id))}>
            ⇄ Inverser
          </Button>
        )}
      </form>
      {me && (!a || !b) && a?.id !== me.osuId && b?.id !== me.osuId && (
        <p className="hint compare-me">
          <button type="button" className="chip" onClick={() => (a ? setInputB(me.name) : setInputA(me.name))}>
            Me mettre dans la comparaison ({me.name})
          </button>
        </p>
      )}
      {(formError || error) && (
        <p className="notice" role="alert">
          {formError || error}
        </p>
      )}

      <div className="compare-sides">
        {side(a, "a")}
        {side(b, "b")}
      </div>

      {comparison && a && b && (
        <>
          <section className="compare-verdict" aria-label="Résumé de la comparaison">
            <ul>
              {comparison.verdict.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <div className="compare-table" role="table" aria-label="Comparaison détaillée des joueurs">
            <div className="compare-row compare-head" role="row">
              <span role="columnheader">Critère</span>
              <span role="columnheader">{a.username}</span>
              <span role="columnheader">{b.username}</span>
            </div>
            {comparison.rows.map((row) => (
              <div className="compare-row" role="row" key={row.label}>
                <span role="rowheader" className="compare-label">
                  {row.label}
                </span>
                <span role="cell" className={row.better === "a" ? "is-higher" : undefined}>
                  {row.a}
                </span>
                <span role="cell" className={row.better === "b" ? "is-higher" : undefined}>
                  {row.b}
                </span>
              </div>
            ))}
          </div>
          <p className="hint">
            La meilleure valeur est mise en avant (pour le rang : le plus petit). Les lignes de style de jeu ne
            désignent personne.
          </p>

          {comparison.common.length > 0 && (
            <>
              <h2 className="section-title">Beatmaps en commun</h2>
              <div className="plays">
                {comparison.common.map((play) => (
                  <div className="play-row common-row" key={play.beatmapsetId}>
                    <img src={coverUrl(play.beatmapsetId)} alt="" loading="lazy" width={46} height={46} />
                    <div className="info">
                      <Link to={`/beatmap/${play.beatmapsetId}`}>{play.title}</Link>
                      <p>{play.artist}</p>
                    </div>
                    <div className="score">
                      <b>
                        {play.a.pp ?? "—"} pp · {play.b.pp ?? "—"} pp
                      </b>
                      {play.a.mods.join("") || "NM"} / {play.b.mods.join("") || "NM"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
