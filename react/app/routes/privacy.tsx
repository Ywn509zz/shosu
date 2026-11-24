import { Link } from "react-router";

import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = () => [
  { title: "Confidentialité — shOsu!" },
  { name: "description", content: "Ce que shOsu! lit, garde et partage, et comment supprimer tes données." },
];

/** Page de confidentialité. À tenir à jour à chaque fonctionnalité qui touche aux données (voir docs/FEATURES.md § Confidentialité). */
export default function Privacy() {
  return (
    <>
      <section className="page-head">
        <p className="eyebrow">CONFIDENTIALITÉ</p>
        <h1>Ce que shOsu! lit, garde et partage.</h1>
        <p>
          Dernière mise à jour : 24 novembre 2026. shOsu! est un projet personnel et gratuit, sans publicité ni pistage.
        </p>
      </section>

      <article className="prose">
        <h2>Ce que shOsu! lit chez osu!</h2>
        <p>
          La connexion ne demande que la permission <b>identify</b> : shOsu! connaît ton pseudo, ton identifiant et ta
          photo osu!. <b>Il n'a accès ni à tes messages, ni à tes amis, ni à ton e-mail.</b> Les autres données (profil,
          scores, beatmaps favorites, activité) sont celles que n'importe qui peut voir sur ton profil public osu.ppy.sh
          ; shOsu! les lit pour afficher ton profil, tes statistiques, tes recommandations et pour répondre à Stack.
        </p>

        <h2>Ce que shOsu! garde sur ses serveurs</h2>
        <ul>
          <li>
            <b>Ta session</b> : un cookie chiffré, strictement nécessaire à la connexion (7 jours). Aucun autre cookie,
            aucun traceur.
          </li>
          <li>
            <b>Tes listes</b> (favoris, à jouer plus tard), <b>tes collections</b> (privées par défaut),{" "}
            <b>ton profil personnalisé</b> (biographie, couleur, bannière) et <b>un relevé quotidien</b> de tes
            statistiques osu! (pp, rang, précision, parties) pour dessiner tes courbes, gardés environ 4 mois.
          </li>
          <li>
            Ces données sont stockées chez <b>Upstash</b> (base Redis) ; le site est hébergé par <b>Vercel</b>.
          </li>
        </ul>

        <h2>Ce qui est public</h2>
        <p>
          Une collection que tu <b>partages</b> est visible par toute personne qui a son lien, et listée dans les
          collections publiques. Ton profil personnalisé (biographie, collections en vedette) est visible sur ta page de
          profil. Tout le reste est privé.
        </p>

        <h2>Stack et l'écoute de sons : Gemini (Google)</h2>
        <p>
          Quand tu écris à Stack, ton message et les données publiques dont il a besoin (par exemple tes scores) sont
          envoyés à l'API <b>Gemini de Google</b> pour produire la réponse. Un extrait sonore que tu fais écouter est
          envoyé de la même façon. shOsu! ne conserve ni tes messages, ni les extraits audio, ni les réponses : la
          conversation reste dans l'onglet de ton navigateur et disparaît à sa fermeture. Google traite ces envois selon
          ses propres conditions.
        </p>

        <h2>Ce qui reste dans ton navigateur</h2>
        <p>
          L'historique (recherches, écoutes, beatmaps consultées), le thème clair ou sombre et la conversation avec
          Stack sont gardés <b>uniquement dans ton navigateur</b> : ils ne sont pas envoyés au serveur.
        </p>

        <h2>Tes droits</h2>
        <p>
          Sur la page <Link to="/my-data">Mes données</Link>, tu peux <b>voir</b> ce que shOsu! garde sur toi, le{" "}
          <b>télécharger</b> (JSON) et le <b>supprimer en un clic</b>. La suppression est définitive ; elle n'affecte
          pas ton compte osu!. Pour une question, contacte le créateur du site.
        </p>
      </article>
    </>
  );
}
