import { Button } from "@heroui/react";
import { useId, useState } from "react";
import { Link } from "react-router";

import { toTrack } from "~/components/beatmap-card";
import { ListButtons } from "~/components/list-buttons";
import type { SimilarMap } from "~/lib/insights";
import type { ScoreLine } from "~/lib/insights";
import { coverUrl, getStarColor } from "~/lib/osu";
import { usePlayer, type Track } from "~/lib/player";
import { finalizeScore } from "~/lib/score";

const points = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * « Pourquoi 77 % ? » : chaque critère avec ses points, une barre et une phrase d'explication. Le pourcentage est
 * points obtenus ÷ points possibles des critères **applicables** ; un critère non applicable est montré mais ne compte pas.
 */
function ScoreExplain({ id, score, breakdown }: { id: string; score: number; breakdown: ScoreLine[] }) {
  const { total, possible } = finalizeScore(breakdown);
  return (
    <div className="score-explain" id={id} role="region" aria-label={`Pourquoi ${score} % ?`}>
      <p className="score-intro">
        <b>Pourquoi {score} % ?</b> Chaque critère rapporte des points ; le score est le total obtenu divisé par le
        total possible pour cette beatmap. 100 % signifie « au maximum sur tous les critères qui s'appliquent ».
      </p>
      <ul className="score-lines">
        {breakdown.map((l) => (
          <li key={l.key} className={l.applicable ? undefined : "is-na"}>
            <div className="score-line-head">
              <b>{l.label}</b>
              <span>{l.applicable ? `${points(l.points)} / ${l.max}` : "ne compte pas"}</span>
            </div>
            {l.applicable && (
              <div className="bar" aria-hidden>
                <i style={{ width: `${l.max ? Math.max(l.points > 0 ? 4 : 0, (l.points / l.max) * 100) : 0}%` }} />
              </div>
            )}
            <small>
              {l.applicable ? l.detail : `${l.detail} — critère non applicable ici, il n'entre pas dans le calcul.`}
            </small>
          </li>
        ))}
      </ul>
      <p className="score-total">
        Total : <b>{points(total)}</b> / {points(possible)} points → <b>{score} %</b>
      </p>
    </div>
  );
}

/** Carte compacte d'une beatmap « proche » ou « recommandée » : couverture, raisons, pourcentage, listes, aperçu. */
export function MapMatchCard({ item, queue }: { item: SimilarMap; queue: Track[] }) {
  const player = usePlayer();
  const track = toTrack(item);
  const playing = player.isPlaying(item.id);
  const [explain, setExplain] = useState(false);
  const explainId = useId();

  return (
    <article className="similar-card">
      <img src={coverUrl(item.id)} alt="" loading="lazy" width={72} height={72} />
      <div className="similar-body">
        <Link to={`/beatmap/${item.id}`}>{item.title}</Link>
        <p>
          {item.artist} · {item.creator}
          {item.minStars !== null && item.maxStars !== null && (
            <span style={{ color: getStarColor(item.maxStars), fontWeight: 800 }}>
              {" "}
              ⭐ {item.minStars.toFixed(1)}–{item.maxStars.toFixed(1)}
            </span>
          )}
        </p>
        <ul className="similar-reasons">
          {item.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      <div className="similar-side">
        <button
          type="button"
          className="similar-score"
          aria-expanded={explain}
          aria-controls={explainId}
          title="Voir pourquoi ce pourcentage"
          onClick={() => setExplain((open) => !open)}
        >
          {item.score}% <span aria-hidden>{explain ? "▴" : "ⓘ"}</span>
        </button>
        <div className="card-actions">
          <ListButtons id={item.id} />
          {track && (
            <Button
              className="icon-btn"
              aria-label={`${playing ? "Pause" : "Écouter"} ${item.title}`}
              aria-pressed={playing}
              onPress={() => player.toggle(track, queue)}
            >
              {playing ? "⏸" : "▶"}
            </Button>
          )}
        </div>
      </div>
      {explain && item.breakdown && <ScoreExplain id={explainId} score={item.score} breakdown={item.breakdown} />}
    </article>
  );
}
