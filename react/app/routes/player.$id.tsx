import { Link, data, useRouteLoaderData } from "react-router";

import { CollectionTile } from "~/components/collection-tile";
import { PerformanceAnalysisSection } from "~/components/performance-analysis";
import { ProfileEditor } from "~/components/profile-editor";
import { ProgressTracker } from "~/components/progress-tracker";

import { avatarUrl, coverUrl, countryFlag, formatNumber, getStarColor, parsePlayerRef, playerUrl } from "~/lib/osu";
import { OsuError, getPlayerPage } from "~/lib/osu.server";
import { listPublicCollections } from "~/lib/collections.server";
import { DEFAULT_CUSTOM } from "~/lib/profile-custom";
import { getProfileCustom } from "~/lib/profile-custom.server";

import type { loader as layoutLoader } from "./layout";
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
    const player = await getPlayerPage(params.id, mode);
    // Personnalisation et collections publiques du joueur : un échec de lecture ne doit jamais empêcher d'afficher le profil.
    const [custom, publicCollections] = await Promise.all([
      getProfileCustom(player.id).catch(() => DEFAULT_CUSTOM),
      listPublicCollections({ ownerId: player.id }).catch(() => []),
    ]);
    return { player, custom, publicCollections };
  } catch (error) {
    if (error instanceof OsuError && error.status === 404) throw data(null, { status: 404 });
    console.error("Player page error:", error instanceof Error ? error.name : "Error");
    throw data(null, { status: 502, statusText: "osu! est momentanément indisponible." });
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.player.username} — shOsu!` },
        { property: "og:type", content: "profile" },
        { property: "og:site_name", content: "shOsu!" },
        { property: "og:title", content: `${loaderData.player.username} sur shOsu!` },
        {
          property: "og:description",
          content: loaderData.player.globalRank
            ? `Rang mondial #${loaderData.player.globalRank} · ${loaderData.player.pp ?? "—"} pp`
            : "Profil osu! sur shOsu!",
        },
        { property: "og:image", content: avatarUrl(loaderData.player.id) },
        { name: "twitter:card", content: "summary" },
      ]
    : [{ title: "Joueur — shOsu!" }];

export default function PlayerProfile({ loaderData }: Route.ComponentProps) {
  const { player, custom, publicCollections } = loaderData;
  const flag = countryFlag(player.country);
  const isMe = useRouteLoaderData<typeof layoutLoader>("routes/layout")?.user?.osuId === player.id;
  // Le style personnalisé ne s'applique que si le joueur a réellement personnalisé son profil (sinon : le design d'origine).
  const customized = Boolean(custom.bio) || custom.accent !== "violet" || custom.banner !== "midnight" || custom.featured.length > 0;
  const featured = custom.featured.map((id) => publicCollections.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const others = publicCollections.filter((c) => !custom.featured.includes(c.id));
  const modeLabel = MODES.find((m) => m.id === player.mode)?.label ?? player.mode;

  return (
    <>
      <div className="player-hero" data-accent={customized ? custom.accent : undefined} data-banner={customized ? custom.banner : undefined}>
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
          {custom.bio && <p className="player-bio">{custom.bio}</p>}
          <a href={playerUrl(player.id)} target="_blank" rel="noopener noreferrer">
            Voir sur osu.ppy.sh ↗
          </a>
        </div>
      </div>

      {!isMe && (
        <div className="profile-edit-btn">
          <Link className="account-btn" to={`/compare/players?a=${player.id}&mode=${player.mode}`}>
            ⚖ Comparer avec un autre joueur
          </Link>
        </div>
      )}
      {isMe && <ProfileEditor custom={custom} publicCollections={publicCollections} />}

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

          {publicCollections.length > 0 && (
        <section className="profile-collections" aria-labelledby="profile-collections-title">
          <h2 className="section-title" id="profile-collections-title">
            Collections de {player.username}
          </h2>
          <div className="tile-grid">
            {[...featured, ...others].map((collection) => (
              <CollectionTile key={collection.id} collection={collection} showOwner={false} />
            ))}
          </div>
        </section>
      )}

      <ProgressTracker playerId={player.id} mode={player.mode} isMe={isMe} />
      <PerformanceAnalysisSection playerId={player.id} mode={player.mode} />

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
