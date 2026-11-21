import { Link } from "react-router";

import { PLANS, type PlanId } from "~/lib/plans";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/premium";

export const meta: Route.MetaFunction = () => [{ title: "Plans — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  return { signedIn: user !== null, plan: (user?.plan ?? null) as PlanId | null };
}

const nf = (n: number) => n.toLocaleString("fr-FR");

export default function Premium({ loaderData }: Route.ComponentProps) {
  const { signedIn, plan } = loaderData;
  const free = PLANS.free;
  const premium = PLANS.premium;

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">PLANS</p>
        <h1>shOsu! est gratuit pour tout le monde.</h1>
        <p>
          Recherche, suggestions, profils, listes et Stack sont inclus, sans paiement. Le plan Premium offre simplement plus de messages et de place : il est
          attribué sur invitation, gratuitement.
        </p>
      </section>

      <div className="plan-grid">
        <article className={`plan-card${plan === "free" ? " is-current" : ""}`}>
          <h2>{free.label}</h2>
          <p className="plan-price">0 €</p>
          <ul>
            <li>Recherche, suggestions, profils et pages de beatmaps</li>
            <li>Lecteur d'aperçus et raccourcis clavier</li>
            <li>
              Stack : <b>{free.stackMessagesPer10Min} messages</b> par 10 min
            </li>
            <li>Recherche par le son (Shazam pour osu!)</li>
            <li>
              Favoris et « à jouer plus tard » : <b>{nf(free.listLimit)} beatmaps</b> par liste
            </li>
          </ul>
          {plan === "free" && <p className="plan-state">✓ Ton plan actuel</p>}
        </article>

        <article className={`plan-card is-premium${plan === "premium" ? " is-current" : ""}`}>
          <h2>
            {premium.label} <span className="plan-badge">✦</span>
          </h2>
          <p className="plan-price">Sur invitation</p>
          <ul>
            <li>Tout le plan {free.label}</li>
            <li>
              Stack : <b>{premium.stackMessagesPer10Min} messages</b> par 10 min ({Math.round(premium.stackMessagesPer10Min / free.stackMessagesPer10Min)}× plus)
            </li>
            <li>
              Favoris et « à jouer plus tard » : <b>{nf(premium.listLimit)} beatmaps</b> par liste
            </li>
          </ul>
          {plan === "premium" ? (
            <p className="plan-state">✓ Ton plan actuel</p>
          ) : !signedIn ? (
            <a className="account-btn" href="/api/auth/login">
              Se connecter avec osu!
            </a>
          ) : (
            <p className="plan-state is-soon">Le Premium est attribué sur invitation, sans paiement.</p>
          )}
        </article>
      </div>

      <p className="notice">
        Ces limites servent à garder le site gratuit et rapide pour tous, et peuvent évoluer. Besoin de plus ? Parle-en au créateur du site.{" "}
        <Link to="/">Retour à la recherche</Link>
      </p>
    </>
  );
}
