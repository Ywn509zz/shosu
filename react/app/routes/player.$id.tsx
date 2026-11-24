import { Link, data } from "react-router";

import { avatarUrl, coverUrl, countryFlag, formatNumber, getStarColor, parsePlayerRef, playerUrl } from "~/lib/osu";
import { OsuError, getPlayerPage } from "~/lib/osu.server";

import type { Route } from "./+types/player.$id";

const MODES = [
  { id: "osu", label: "Standard" },
  { id: "taiko", label: "Taiko" },
  { id: "fruits", label: "fruits" },
  { id: "mania", label: "Mania" },
];

export async function loader({ params, request }: Route.LoaderArgs) {
  const ref = parsePlayerRef(params.id);
  if (!ref) throw data(null, { status: 404 });

  const requested = new URL(request.url).searchParams.get("mode");
  const mode = MODES.find((m) => m.id === requested)?.id ?? "osu";

  try {
    return { player: await getPlayerPage(params.id, mode) };
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) throw data(null, { status: 404 });
    console.error("Player page error:", error instanceof Error ? error.name : "Error");
    throw data(null, { status: 502, statusText: "osu! est momentanément indisponible." });
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.player.username} — shOsu!` : "Joueur — shOsu!" },
];

export default function PlayerProfile({ loaderData }: Route.ComponentProps) {
  const { player } = loaderData;
  const flag = countryFlag(player.country);
  const modeLabel = MODES.find((m) => m.id === player.mode)?.label ?? player.mode;

  return (
    <>
      <div className="player-hero">
        <img src={avatarUrl(player.id)} alt={`Avatar de ${player.username}`} width={96} height={96} />
        <div>
          <p className="eyebrow">PROFIL JOUEUR</p>
          <h1 translate="no">{player.username}</h1>
          <p>
            {flag} {player.country ?? ""}
            {player.globalRank
              ? ` · Rang mondial #${formatNumber(player.globalRank)}`
              : player.hasStats
                ? " · Non classé"
                : ""}
            {player.countryRank ? ` · ${player.country} #${formatNumber(player.countryRank)}` : ""}
          </p>
          <a href={playerUrl(player.id)} target="_blank" rel="noopener noreferrer">
            Voir sur osu.ppy.sh ↗
          </a>
        </div>
      </div>

      <nav className="tabs" aria-label="Mode de jeu">
        {MODES.map((m) => (
          <Link
            key={m.id}
            className={`tab${player.mode === m.id ? " is-active" : ""}`}
            to={`?mode=${m.id}`}
            aria-current={player.mode === m.id ? "page" : undefined}
            translate="no"
          >
            {m.label}
          </Link>
        ))}
      </nav>

      {!player.hasStats ? (
        <div className="mode-empty" role="status">
          <span className="mode-empty-icon" aria-hidden>
            ◌
          </span>
          <h2>Pas encore de statistiques en {modeLabel}</h2>
          <p>
            <b translate="no">{player.username}</b> n'a pas encore joué dans ce mode, ou n'a aucun score classé. Essaie
            un autre mode ci-dessus.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span>Performance</span>
              <strong>{player.pp !== null ? `${formatNumber(player.pp)} pp` : "—"}</strong>
            </div>
            <div className="stat-tile">
              <span>Précision</span>
              <strong>{player.accuracy !== null ? `${player.accuracy.toFixed(2)} %` : "—"}</strong>
            </div>
            <div className="stat-tile">
              <span>Parties</span>
              <strong>{formatNumber(player.playCount)}</strong>
            </div>
            <div className="stat-tile">
              <span>Niveau</span>
              <strong>{player.level ?? "—"}</strong>
            </div>
            <div className="stat-tile">
              <span>Temps de jeu</span>
              <strong>{player.playTimeHours !== null ? `${formatNumber(player.playTimeHours)} h` : "—"}</strong>
            </div>
            <div className="stat-tile">
              <span>Combo max</span>
              <strong>{formatNumber(player.maxCombo)}</strong>
            </div>
            <div className="stat-tile">
              <span>Grades SS · S · A</span>
              <strong>
                {player.grades.ss} · {player.grades.s} · {player.grades.a}
              </strong>
            </div>
          </div>

          <h2 className="section-title">Meilleurs scores</h2>
          {player.topPlays.length === 0 ? (
            <p className="empty">Aucun score public pour ce mode.</p>
          ) : (
            <div className="plays">
              {player.topPlays.map((play, index) => (
                <div className="play-row" key={`${play.beatmapsetId}-${index}`}>
                  <span className="rank-no">{index + 1}</span>
                  <img src={coverUrl(play.beatmapsetId)} alt="" loading="lazy" width={46} height={46} />
                  <div className="info">
                    <Link to={`/beatmap/${play.beatmapsetId}`}>{play.title}</Link>
                    <p>
                      {play.artist} · [{play.version}]{" "}
                      <span style={{ color: getStarColor(play.stars), fontWeight: 800 }}>
                        ⭐ {play.stars.toFixed(2)}
                      </span>
                      {play.mods.map((mod) => (
                        <span className="mod" key={mod}>
                          {mod}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="score">
                    <b>{play.pp !== null ? `${play.pp} pp` : "—"}</b>
                    {play.accuracy !== null ? `${play.accuracy.toFixed(2)} %` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
