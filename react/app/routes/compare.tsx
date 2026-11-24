import { Button } from "@heroui/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { compareSets } from "~/lib/compare";
import { beatmapsetUrl, coverUrl, formatDuration, getStarColor, type BeatmapsetDetail } from "~/lib/osu";
import { OsuError, getBeatmapset } from "~/lib/osu.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { findSimilar } from "~/lib/similar.server";
import type { SimilarMap } from "~/lib/insights";

import type { Route } from "./+types/compare";

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData?.a && loaderData?.b
    ? [{ title: `${loaderData.a.title} ou ${loaderData.b.title} ? — shOsu!` }]
    : [{ title: "Comparer deux beatmaps — shOsu!" }];

const ID = /^\d{1,10}$/;

async function load(id: string | null): Promise<{ set: BeatmapsetDetail | null; error: string | null }> {
  if (!id) return { set: null, error: null };
  if (!ID.test(id)) return { set: null, error: "Identifiant de beatmap invalide." };
  try {
    return { set: await getBeatmapset(Number(id)), error: null };
  } catch (error) {
    if (error instanceof OsuError && error.status === 404)
      return { set: null, error: `La beatmap ${id} n'existe pas.` };
    return { set: null, error: "osu! est momentanément indisponible." };
  }
}

/** /compare?a=<set>&b=<set> : comparaison côte à côte ; avec seulement `a`, propose des beatmaps proches à comparer. */
export async function loader({ request }: Route.LoaderArgs) {
  const hit = await rateLimit(`compare:${clientIp(request)}`, 40, 60_000, false);
  if (!hit.ok) throw new Response(null, { status: 429, statusText: "Trop de requêtes, réessaie dans un instant." });

  const params = new URL(request.url).searchParams;
  const [{ set: a, error: errorA }, { set: b, error: errorB }] = await Promise.all([
    load(params.get("a")),
    load(params.get("b")),
  ]);

  let suggestions: SimilarMap[] = [];
  if (a && !b)
    suggestions = await findSimilar(a.id)
      .then((items) => items.slice(0, 6))
      .catch(() => []);

  return {
    a,
    b,
    error: errorA ?? errorB,
    suggestions,
    comparison: a && b ? compareSets(a, b) : null,
  };
}

/** Accepte un identifiant ou un lien osu! (…/beatmapsets/123#osu/456) et en tire l'identifiant du set. */
function parseSetId(value: string): string | null {
  const text = value.trim();
  if (ID.test(text)) return text;
  const match = /beatmapsets\/(\d{1,10})/.exec(text);
  return match ? match[1] : null;
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { a, b, error, suggestions, comparison } = loaderData;
  const navigate = useNavigate();
  const [inputA, setInputA] = useState(a ? String(a.id) : "");
  const [inputB, setInputB] = useState(b ? String(b.id) : "");
  const [formError, setFormError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const idA = parseSetId(inputA);
    const idB = parseSetId(inputB);
    if (!idA || !idB) {
      setFormError("Entre un identifiant de beatmap ou un lien osu! (osu.ppy.sh/beatmapsets/…) pour chaque côté.");
      return;
    }
    setFormError("");
    void navigate(`/compare?a=${idA}&b=${idB}`);
  }

  const side = (set: BeatmapsetDetail | null, which: "a" | "b") =>
    set ? (
      <article className={`compare-side is-${which}`}>
        <img src={coverUrl(set.id)} alt="" width={96} height={96} />
        <div>
          <Link to={`/beatmap/${set.id}`}>{set.title}</Link>
          <p>
            {set.artist} · {set.creator}
          </p>
          <small>
            {set.maxStars !== null && <b style={{ color: getStarColor(set.maxStars) }}>⭐ {set.maxStars.toFixed(2)}</b>}
            {set.bpm ? ` · ${Math.round(set.bpm)} BPM` : ""} · {formatDuration(set.lengthSeconds)} ·{" "}
            <a href={beatmapsetUrl(set.id)} target="_blank" rel="noopener noreferrer">
              osu.ppy.sh ↗
            </a>
          </small>
        </div>
      </article>
    ) : (
      <article className="compare-side is-empty">
        <p>{which === "a" ? "Beatmap A" : "Beatmap B"} : à choisir.</p>
      </article>
    );

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">COMPARAISON</p>
        <h1>Comparer deux beatmaps</h1>
        <p>Difficulté, tempo, durée, popularité, ressemblance musicale : côte à côte.</p>
      </section>

      <form className="compare-form" onSubmit={submit}>
        <input
          type="text"
          value={inputA}
          placeholder="Beatmap A : id ou lien osu!"
          aria-label="Beatmap A"
          onChange={(e) => setInputA(e.target.value)}
        />
        <span aria-hidden>⚖</span>
        <input
          type="text"
          value={inputB}
          placeholder="Beatmap B : id ou lien osu!"
          aria-label="Beatmap B"
          onChange={(e) => setInputB(e.target.value)}
        />
        <Button type="submit" className="account-btn">
          Comparer
        </Button>
        {a && b && (
          <Button className="account-btn" onPress={() => void navigate(`/compare?a=${b.id}&b=${a.id}`)}>
            ⇄ Inverser
          </Button>
        )}
      </form>
      {(formError || error) && (
        <p className="notice" role="alert">
          {formError || error}
        </p>
      )}

      <div className="compare-sides">
        {side(a, "a")}
        {side(b, "b")}
      </div>

      {a && !b && suggestions.length > 0 && (
        <div className="chips compare-suggestions">
          <span className="hint">Comparer avec une beatmap proche :</span>
          {suggestions.map((s) => (
            <Link className="chip" key={s.id} to={`/compare?a=${a.id}&b=${s.id}`}>
              {s.title} — {s.artist}
            </Link>
          ))}
        </div>
      )}

      {comparison && a && b && (
        <>
          <section className="compare-verdict" aria-label="Résumé de la comparaison">
            <div className="compare-score" title="Ressemblance musicale">
              <strong>{comparison.similarity.sound}%</strong>
              <span>de ressemblance musicale</span>
            </div>
            <ul>
              {comparison.verdict.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <div className="compare-table" role="table" aria-label="Comparaison détaillée">
            <div className="compare-row compare-head" role="row">
              <span role="columnheader">Critère</span>
              <span role="columnheader">A · {a.title}</span>
              <span role="columnheader">B · {b.title}</span>
            </div>
            {comparison.rows.map((row) => (
              <div className="compare-row" role="row" key={row.label}>
                <span role="rowheader" className="compare-label">
                  {row.label}
                </span>
                <span role="cell" className={row.higher === "a" ? "is-higher" : undefined}>
                  {row.a}
                </span>
                <span role="cell" className={row.higher === "b" ? "is-higher" : undefined}>
                  {row.b}
                </span>
              </div>
            ))}
          </div>
          <p className="hint">La valeur la plus haute est mise en avant : plus haut ne veut pas dire « mieux ».</p>
        </>
      )}
    </>
  );
}
