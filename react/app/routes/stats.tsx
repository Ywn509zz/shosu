import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Avatar } from "~/components/avatar";
import { PerformanceAnalysisSection } from "~/components/performance-analysis";
import { ProgressTracker } from "~/components/progress-tracker";
import { useHistory } from "~/lib/history";
import { LIST_LABELS } from "~/lib/lists";
import { useLists } from "~/lib/lists-context";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/stats";

export const meta: Route.MetaFunction = () => [{ title: "Mes statistiques — shOsu!" }];

const MODES = [
  { id: "osu", label: "Standard" },
  { id: "taiko", label: "Taiko" },
  { id: "fruits", label: "fruits" },
  { id: "mania", label: "Mania" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  return { osuId: user?.osuId ?? null, name: user?.name ?? null };
}

/** Mes statistiques : progression, points faibles et activité sur shOsu! du joueur connecté. */
export default function Stats({ loaderData }: Route.ComponentProps) {
  const { osuId, name } = loaderData;
  const [params] = useSearchParams();
  const requested = params.get("mode");
  const mode = MODES.find((m) => m.id === requested)?.id ?? "osu";

  const lists = useLists();
  const history = useHistory();
  const [collections, setCollections] = useState<{ total: number; shared: number } | null>(null);

  useEffect(() => {
    if (!osuId) return;
    const controller = new AbortController();
    fetch("/api/collections", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { collections: { public: boolean }[] };
        setCollections({ total: body.collections.length, shared: body.collections.filter((c) => c.public).length });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [osuId]);

  if (!osuId) {
    return (
      <>
        <section className="page-head">
          <p className="eyebrow">MES STATISTIQUES</p>
          <h1>Ta progression, tes points forts.</h1>
          <p>
            Connecte-toi avec osu! pour suivre ton évolution, repérer tes points faibles et voir ton activité sur
            shOsu!.
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

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">MES STATISTIQUES</p>
        <Avatar id={osuId} name={name ?? "?"} size={72} className="stats-avatar" />
        <h1 translate="no">{name}</h1>
        <p>
          Ta progression, tes points faibles et ton activité.{" "}
          <Link to={`/player/${osuId}`}>Voir mon profil public</Link>
        </p>
      </section>

      <nav className="tabs" aria-label="Mode de jeu">
        {MODES.map((m) => (
          <Link
            key={m.id}
            className={`tab${mode === m.id ? " is-active" : ""}`}
            to={`?mode=${m.id}`}
            aria-current={mode === m.id ? "page" : undefined}
            translate="no"
          >
            {m.label}
          </Link>
        ))}
      </nav>

      <ProgressTracker playerId={osuId} mode={mode} isMe />
      <PerformanceAnalysisSection playerId={osuId} mode={mode} />

      <section className="activity" aria-labelledby="activity-title">
        <h2 className="section-title" id="activity-title">
          Mon activité sur shOsu!
        </h2>
        <div className="stat-tiles">
          <Link className="stat-tile" to="/lists?list=favorites">
            <span>{LIST_LABELS.favorites}</span>
            <strong>{lists.loaded ? lists.count("favorites") : "…"}</strong>
          </Link>
          <Link className="stat-tile" to="/lists?list=later">
            <span>{LIST_LABELS.later}</span>
            <strong>{lists.loaded ? lists.count("later") : "…"}</strong>
          </Link>
          <Link className="stat-tile" to="/lists?list=collections">
            <span>Collections</span>
            <strong>
              {collections ? collections.total : "…"}{" "}
              {collections && collections.shared > 0 && (
                <small>
                  ({collections.shared} partagée{collections.shared > 1 ? "s" : ""})
                </small>
              )}
            </strong>
          </Link>
          <Link className="stat-tile" to="/history?tab=views">
            <span>Beatmaps consultées</span>
            <strong>{history.views.length}</strong>
          </Link>
          <Link className="stat-tile" to="/history">
            <span>Recherches</span>
            <strong>{history.searches.length}</strong>
          </Link>
          <Link className="stat-tile" to="/history?tab=listens">
            <span>Écoutes 🎧</span>
            <strong>{history.listens.length}</strong>
          </Link>
        </div>
        <p className="hint">
          Les recherches, écoutes et consultations sont comptées dans ce navigateur (l'historique reste local). Découvre aussi ton{" "}
          <Link to="/dna">Music DNA</Link> : genres, langues et tempo que tu préfères.
        </p>
      </section>
    </>
  );
}
