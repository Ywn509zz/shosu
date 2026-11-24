import { Link, data } from "react-router";

import { BarChart } from "~/components/charts";
import { getUsageSummary, type UsageDay } from "~/lib/usage.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "Quotas — shOsu!" }, { name: "robots", content: "noindex" }];

/** Tableau de bord des quotas : réservé aux administrateurs (ADMIN_USER_IDS) ; les autres reçoivent un 404, comme si la page n'existait pas. */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.isAdmin) throw data(null, { status: 404 });
  return { usage: await getUsageSummary(true) };
}

const nf = (n: number) => n.toLocaleString("fr-FR");

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { usage } = loaderData;
  const last14 = usage.days.slice(-14);
  const tile = (label: string, today: number, month: number, hint?: string) => (
    <div className="stat-tile" key={label}>
      <span>{label}</span>
      <strong>{nf(month)}</strong>
      <small className="hint">
        aujourd'hui {nf(today)}
        {hint ? ` · ${hint}` : ""}
      </small>
    </div>
  );
  const pick = (day: UsageDay, key: keyof UsageDay) => day[key] as number;

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">QUOTAS</p>
        <h1>Usage de shOsu!</h1>
        <p>
          Estimations de ce mois-ci (UTC) : commandes Redis, appels osu!, requêtes Gemini. Réservé aux administrateurs.
        </p>
      </section>

      <div className={`usage-level is-${usage.level}`} role="status">
        {usage.message}
      </div>

      <div className="quota-bar" aria-label={`Redis : ${Math.round(usage.redisPercent * 100)} % du quota mensuel`}>
        <i style={{ width: `${Math.min(100, usage.redisPercent * 100)}%` }} data-level={usage.level} />
        <span>
          {nf(usage.month.redis)} / {nf(usage.limits.redisMonth)} commandes Redis
        </span>
      </div>

      <div className="stat-tiles">
        {tile("Redis (commandes)", usage.today.redis, usage.month.redis, `projection ${nf(usage.redisProjection)}`)}
        {tile("API osu! (appels)", usage.today.osu, usage.month.osu)}
        {tile("Gemini (requêtes)", usage.today.gemini, usage.month.gemini)}
        {tile("Gemini · jetons entrée", usage.today.geminiIn, usage.month.geminiIn)}
        {tile("Gemini · jetons sortie", usage.today.geminiOut, usage.month.geminiOut)}
        {tile("Messages Stack", usage.today.stack, usage.month.stack)}
        {tile("Extraits écoutés", usage.today.listen, usage.month.listen)}
      </div>

      <div className="chart-grid">
        <BarChart
          title="Redis · commandes par jour"
          items={last14.map((d) => ({ label: d.date, value: pick(d, "redis") }))}
        />
        <BarChart
          title="Gemini · requêtes par jour"
          items={last14.map((d) => ({ label: d.date, value: pick(d, "gemini") }))}
        />
        <BarChart
          title="API osu! · appels par jour"
          items={last14.map((d) => ({ label: d.date, value: pick(d, "osu") }))}
        />
      </div>

      <p className="notice">
        Ces chiffres sont des <b>estimations</b> : seules les commandes envoyées par le code de shOsu! sont comptées, et
        les compteurs d'une instance arrêtée avant son vidage (au plus 30 s) sont perdus. Le chiffre officiel est dans
        la console Upstash. Limite Redis réglable avec <code>REDIS_MONTHLY_LIMIT</code>.{" "}
        <Link to="/">Retour au site</Link>
      </p>
    </>
  );
}
