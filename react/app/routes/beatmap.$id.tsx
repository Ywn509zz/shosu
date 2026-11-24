import { Button } from "@heroui/react";
import { useState } from "react";
import { data } from "react-router";

import { DifficultyAnalysisPanel } from "~/components/difficulty-analysis";
import { ListButtons } from "~/components/list-buttons";
import { SimilarMaps } from "~/components/similar-maps";
import { toTrack } from "~/components/beatmap-card";
import { useAssistant } from "~/lib/assistant-context";
import {
  beatmapsetUrl,
  coverUrl,
  formatDuration,
  formatNumber,
  getStarColor,
  osuDirectUrl,
  OSU_BASE_URL,
} from "~/lib/osu";
import { OsuError, getBeatmapset } from "~/lib/osu.server";
import { usePlayer } from "~/lib/player";

import type { Route } from "./+types/beatmap.$id";

export async function loader({ params }: Route.LoaderArgs) {
  if (!/^\d{1,10}$/.test(params.id)) throw data(null, { status: 404 });
  try {
    return { set: await getBeatmapset(Number(params.id)) };
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) throw data(null, { status: 404 });
    console.error("Beatmap detail error:", error instanceof Error ? error.name : "Error");
    throw data(null, { status: 502, statusText: "osu! est momentanément indisponible." });
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [{ title: `${loaderData.set.title} — shOsu!` }, { name: "description", content: `${loaderData.set.artist} · mappé par ${loaderData.set.creator}` }]
    : [{ title: "Beatmap — shOsu!" }];

export default function BeatmapDetail({ loaderData }: Route.ComponentProps) {
  const { set } = loaderData;
  const player = usePlayer();
  const { ask } = useAssistant();
  const track = toTrack(set);
  const playing = player.isPlaying(set.id);
  // Une seule analyse ouverte à la fois (chaque analyse interroge osu! plusieurs fois).
  const [openDiff, setOpenDiff] = useState<number | null>(null);
  const maxStars = Math.max(...set.difficulties.map((d) => d.stars), 1);

  return (
    <>
      <div className="detail-cover">
        <img src={coverUrl(set.id)} alt={`Cover de ${set.title}`} />
        <span className="status-badge">{set.status}</span>
      </div>

      <div className="detail-head">
        <p className="eyebrow">{set.modes.join(" · ") || "BEATMAP"}</p>
        <h1 className="detail-title">{set.title}</h1>
        <p className="detail-sub">
          {set.artist} · mappé par{" "}
          <a
            href={set.creatorId ? `${OSU_BASE_URL}/users/${set.creatorId}` : beatmapsetUrl(set.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {set.creator}
          </a>
        </p>
      </div>

      <div className="detail-actions">
        {track && (
          <Button className="account-btn" aria-pressed={playing} onPress={() => player.toggle(track, [track])}>
            {playing ? "⏸ Pause" : "▶ Écouter"}
          </Button>
        )}
        <a className="account-btn" href={osuDirectUrl(set.id)}>
          Ouvrir dans osu!
        </a>
        <a className="account-btn" href={beatmapsetUrl(set.id)} target="_blank" rel="noopener noreferrer">
          Voir sur osu.ppy.sh ↗
        </a>
        <ListButtons id={set.id} />
        <Button
          className="account-btn"
          onPress={() =>
            ask(`Explique-moi la beatmap « ${set.title} » (id ${set.id}) : quel est son style et pourquoi est-elle difficile ?`)
          }
        >
          ✨ Expliquer avec Stack
        </Button>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span>BPM</span>
          <strong>{set.bpm ? Math.round(set.bpm) : "—"}</strong>
        </div>
        <div className="stat-tile">
          <span>Durée</span>
          <strong>{formatDuration(set.lengthSeconds)}</strong>
        </div>
        <div className="stat-tile">
          <span>Favoris</span>
          <strong>{formatNumber(set.favouriteCount)}</strong>
        </div>
        <div className="stat-tile">
          <span>Parties</span>
          <strong>{formatNumber(set.playCount)}</strong>
        </div>
        <div className="stat-tile">
          <span>Difficultés</span>
          <strong>{set.difficulties.length}</strong>
        </div>
        {set.rankedDate && (
          <div className="stat-tile">
            <span>Classée le</span>
            <strong>{new Date(set.rankedDate).toLocaleDateString("fr-FR")}</strong>
          </div>
        )}
      </div>

      {(set.genre || set.language || set.source || set.tags.length > 0) && (
        <div className="chips">
          {set.genre && <span className="chip">{set.genre}</span>}
          {set.language && <span className="chip">{set.language}</span>}
          {set.source && <span className="chip">Source : {set.source}</span>}
          {set.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <h2 className="section-title">Difficultés</h2>
      {set.difficulties.length > 1 && (
        <div className="diff-curve" role="img" aria-label="Progression des difficultés du set">
          {set.difficulties.map((d) => (
            <div className="diff-curve-col" key={d.id} title={`${d.version} : ${d.stars.toFixed(2)}★`}>
              <i style={{ height: `${Math.max(8, (d.stars / maxStars) * 100)}%`, background: getStarColor(d.stars) }} />
              <span>{d.stars.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Clique sur une difficulté pour voir son analyse avec chaque mod.</p>
      <div className="diff-list">
        <div className="diff-row diff-head" aria-hidden>
          <span>Difficulté</span>
          <span>Étoiles</span>
          <span>CS</span>
          <span>AR</span>
          <span>OD</span>
          <span>HP</span>
          <span>Combo</span>
        </div>
        {set.difficulties.map((d) => {
          const open = openDiff === d.id;
          return (
            <div className={`diff-item${open ? " is-open" : ""}`} key={d.id}>
              <div
                className="diff-row is-clickable"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-controls={`analysis-${d.id}`}
                onClick={() => setOpenDiff(open ? null : d.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenDiff(open ? null : d.id);
                  }
                }}
              >
                <div className="name">
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                  {d.version}
                  <small>
                    {d.mode}
                    {d.circles !== null && d.sliders !== null ? ` · ${d.circles + d.sliders + (d.spinners ?? 0)} objets` : ""}
                    {d.bpm ? ` · ${Math.round(d.bpm)} BPM` : ""}
                  </small>
                </div>
                <div className="stars" style={{ color: getStarColor(d.stars) }}>
                  ⭐ {d.stars.toFixed(2)}
                </div>
                <div className="attr">
                  <b>{d.cs ?? "—"}</b>CS
                </div>
                <div className="attr">
                  <b>{d.ar ?? "—"}</b>AR
                </div>
                <div className="attr">
                  <b>{d.od ?? "—"}</b>OD
                </div>
                <div className="attr">
                  <b>{d.hp ?? "—"}</b>HP
                </div>
                <div className="attr">
                  <b>{d.maxCombo ? formatNumber(d.maxCombo) : "—"}</b>combo
                </div>
              </div>
              {open && (
                <div id={`analysis-${d.id}`}>
                  <DifficultyAnalysisPanel beatmapId={d.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SimilarMaps setId={set.id} />
    </>
  );
}
