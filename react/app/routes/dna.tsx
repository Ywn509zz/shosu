import { useEffect, useState } from "react";
import { Link } from "react-router";

import { BarChart } from "~/components/charts";
import { EmptyState } from "~/components/empty-state";
import { toTrack } from "~/components/beatmap-card";
import { MapMatchCard } from "~/components/map-match-card";
import { useHistory } from "~/lib/history";
import type { MusicDna } from "~/lib/insights";
import type { Track } from "~/lib/player";
import { formatDuration } from "~/lib/osu";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/dna";

export const meta: Route.MetaFunction = () => [{ title: "Music DNA — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  return { signedIn: Boolean(user?.osuId) };
}

type State = { phase: "loading" } | { phase: "error"; limited: boolean } | { phase: "ready"; dna: MusicDna | null };

/** Music DNA : l'empreinte musicale du joueur (genres, langues, tempo, artistes, ambiance) et des beatmaps qui lui correspondent. */
export default function Dna({ loaderData }: Route.ComponentProps) {
  const history = useHistory();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    // L'historique des consultations est local : on attend qu'il soit lu avant d'envoyer les identifiants.
    if (!loaderData.signedIn || !history.loaded) return;
    const controller = new AbortController();
    setState({ phase: "loading" });
    fetch("/api/dna", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ viewed: history.views.slice(0, 20).map((v) => v.id) }),
    })
      .then(async (response) => {
        if (!response.ok) {
          setState({ phase: "error", limited: response.status === 429 });
          return;
        }
        const body = (await response.json()) as { dna: MusicDna | null };
        setState({ phase: "ready", dna: body.dna });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setState({ phase: "error", limited: false });
      });
    return () => controller.abort();
    // L'empreinte est recalculée à l'ouverture de la page, pas à chaque beatmap consultée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderData.signedIn, history.loaded]);

  if (!loaderData.signedIn) {
    return (
      <>
        <section className="page-head">
          <p className="eyebrow">MUSIC DNA</p>
          <h1>Ton empreinte musicale.</h1>
          <p>
            Connecte-toi avec osu! : shOsu! analyse les beatmaps que tu aimes, joues et consultes pour dessiner tes
            goûts.
          </p>
        </section>
        <div className="empty">
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      </>
    );
  }

  const dna = state.phase === "ready" ? state.dna : null;
  const queue = dna?.matches.map(toTrack).filter((track): track is Track => track !== null) ?? [];

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">MUSIC DNA</p>
        <h1>Ton ADN musical</h1>
        {dna ? (
          <p className="dna-signature">{dna.signature}.</p>
        ) : (
          <p>L'empreinte de tes goûts, tirée de tes favoris, de tes parties et de tes consultations.</p>
        )}
      </section>

      {state.phase === "loading" && (
        <div className="dna-grid" aria-busy="true" aria-label="Analyse de tes goûts musicaux">
          <div className="skeleton progress-skeleton" />
          <div className="skeleton progress-skeleton" />
          <div className="skeleton progress-skeleton" />
        </div>
      )}

      {state.phase === "error" && (
        <EmptyState icon="⚠" tone="error" title="Music DNA indisponible">
          {state.limited
            ? "Trop de calculs à la suite : réessaie dans quelques minutes."
            : "Impossible de calculer ton ADN musical pour le moment : réessaie dans un instant."}
        </EmptyState>
      )}

      {state.phase === "ready" && !dna && (
        <EmptyState
          icon="🧬"
          title="Pas encore assez de données"
          actions={
            <>
              <Link className="account-btn is-primary" to="/">
                Lancer une recherche
              </Link>
              <Link className="account-btn" to="/lists?list=favorites">
                Importer mes favoris osu!
              </Link>
            </>
          }
        >
          Ton ADN se dessine à partir de tes favoris, de tes beatmaps les plus jouées et de celles que tu consultes.
          Ajoute-en quelques-unes.
        </EmptyState>
      )}

      {dna && (
        <>
          <div className="dna-grid">
            <section className="chart">
              <h2 className="chart-title">Genres</h2>
              {dna.genres.length === 0 && <p className="skill-note">Genre inconnu pour ces beatmaps.</p>}
              {dna.genres.map((g) => (
                <div className="skill-row" key={g.name}>
                  <span translate="no">{g.name}</span>
                  <div className="bar" aria-hidden>
                    <i style={{ width: `${Math.max(4, g.share * 100)}%` }} />
                  </div>
                  <b>{Math.round(g.share * 100)} %</b>
                </div>
              ))}
              {dna.languages.length > 0 && (
                <>
                  <h2 className="chart-title dna-sub">Langues</h2>
                  {dna.languages.map((l) => (
                    <div className="skill-row" key={l.name}>
                      <span translate="no">{l.name}</span>
                      <div className="bar" aria-hidden>
                        <i style={{ width: `${Math.max(4, l.share * 100)}%` }} />
                      </div>
                      <b>{Math.round(l.share * 100)} %</b>
                    </div>
                  ))}
                </>
              )}
            </section>

            <BarChart
              title={`Tempo · ${dna.bpm.tempo}${dna.bpm.average ? ` (≈ ${dna.bpm.average} BPM)` : ""}`}
              items={dna.bpm.histogram}
              format={(v) => `${v} pts`}
            />

            <section className="chart">
              <h2 className="chart-title">Artistes et ambiance</h2>
              <div className="chips">
                {dna.artists.map((artist) => (
                  <Link className="chip" key={artist} to={`/?q=${encodeURIComponent(artist)}`}>
                    ♥ {artist}
                  </Link>
                ))}
              </div>
              <div className="chips">
                {dna.tags.map((tag) => (
                  <Link className="chip" key={tag} to={`/?q=${encodeURIComponent(tag)}`}>
                    {tag}
                  </Link>
                ))}
              </div>
              {dna.averageLengthSeconds && (
                <p className="skill-note">Durée moyenne : {formatDuration(dna.averageLengthSeconds)}.</p>
              )}
            </section>
          </div>

          <p className="hint dna-sample">
            Basé sur {dna.sample.sets} beatmaps : {dna.sample.osuFavourites} favoris osu!, {dna.sample.shosuLists} dans
            tes listes shOsu!, {dna.sample.viewed} consultées récemment, {dna.sample.mostPlayed} parmi les plus jouées et {dna.sample.bestScores} meilleurs scores — la même base que tes recommandations « Pour toi ». Clique sur un pourcentage pour voir comment il est calculé.
          </p>

          <h2 className="section-title">Des morceaux pour ton ADN</h2>
          {dna.matches.length === 0 ? (
            <EmptyState icon="✨" title="Rien de nouveau à te proposer">
              Tout ce qui colle à ton ADN, tu l'as déjà joué ou gardé. Lance une recherche pour explorer autre chose.
            </EmptyState>
          ) : (
            <div className="similar-grid">
              {dna.matches.map((item) => (
                <MapMatchCard key={item.id} item={item} queue={queue} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
