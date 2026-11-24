import { Button } from "@heroui/react";
import { useState } from "react";
import { Link } from "react-router";

import { authClient } from "~/lib/auth-client";
import { summarizeMyData } from "~/lib/my-data.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/my-data";

export const meta: Route.MetaFunction = () => [{ title: "Mes données — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.osuId) return { signedIn: false as const };
  try {
    return { signedIn: true as const, osuId: user.osuId, name: user.name, summary: await summarizeMyData(user.osuId) };
  } catch {
    return { signedIn: true as const, osuId: user.osuId, name: user.name, summary: null };
  }
}

/** Mes données : voir ce que shOsu! garde sur moi, le télécharger (JSON) ou tout supprimer. */
export default function MyData({ loaderData }: Route.ComponentProps) {
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  if (!loaderData.signedIn) {
    return (
      <>
        <section className="page-head">
          <p className="eyebrow">MES DONNÉES</p>
          <h1>Tes données, sous ton contrôle.</h1>
          <p>Connecte-toi avec osu! pour voir ce que shOsu! garde sur toi, le télécharger ou le supprimer.</p>
        </section>
        <div className="empty">
          <a className="account-btn is-primary" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      </>
    );
  }

  const { summary, osuId } = loaderData;

  async function remove() {
    if (confirm !== "SUPPRIMER") return;
    setState("busy");
    try {
      const response = await fetch("/api/my-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "delete", confirm }),
      });
      if (!response.ok) throw new Error();
      // Ce qui est gardé dans le navigateur est effacé aussi.
      try {
        localStorage.removeItem(`shosu-history-v1:${osuId}`);
        localStorage.removeItem(`shosu-snapshot:${osuId}`);
        sessionStorage.removeItem("stack-chat-v2");
      } catch {
        /* stockage indisponible */
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  const items = summary
    ? [
        ["Favoris", summary.favorites],
        ["À jouer plus tard", summary.later],
        [
          "Collections",
          `${summary.collections}${summary.sharedCollections ? ` (${summary.sharedCollections} partagée${summary.sharedCollections > 1 ? "s" : ""})` : ""}`,
        ],
        ["Jours de relevés (pp, rang…)", summary.snapshotDays],
        ["Profil personnalisé", summary.customProfile ? "oui" : "non"],
      ]
    : [];

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">MES DONNÉES</p>
        <h1>Ce que shOsu! garde sur toi.</h1>
        <p>
          Tout est expliqué sur la page <Link to="/privacy">Confidentialité</Link>. Ici tu peux voir, télécharger et
          supprimer tes données.
        </p>
      </section>

      <section className="data-card" aria-labelledby="data-summary">
        <h2 id="data-summary">Enregistré sur le serveur</h2>
        {summary ? (
          <div className="stat-tiles">
            {items.map(([label, value]) => (
              <div className="stat-tile" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="notice">
            Le détail est momentanément indisponible, mais tu peux quand même télécharger ou supprimer tes données.
          </p>
        )}
        <p className="hint">
          Gardés uniquement dans ton navigateur (pas sur le serveur) : historique, thème, conversation avec Stack. Ils
          s'effacent avec la suppression ci-dessous.
        </p>
        <div className="collection-actions">
          <a className="account-btn" href="/api/my-data" download>
            ⬇ Télécharger mes données (JSON)
          </a>
        </div>
      </section>

      <section className="data-card is-danger" aria-labelledby="data-delete">
        <h2 id="data-delete">Supprimer mes données</h2>
        {state === "done" ? (
          <>
            <p>
              C'est fait : tes listes, collections, profil personnalisé et relevés ont été supprimés. Ton compte osu!
              n'est pas touché, et tu peux recommencer à zéro quand tu veux.
            </p>
            <Button className="account-btn" onPress={() => void signOut()}>
              Me déconnecter
            </Button>
          </>
        ) : (
          <>
            <p>
              Cette action est <b>définitive</b> : listes, collections (y compris partagées : leurs liens cesseront de
              fonctionner), profil personnalisé et relevés quotidiens sont effacés. Un plan Premium attribué par
              l'administrateur n'est pas concerné.
            </p>
            <form
              className="rename-form"
              onSubmit={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              <input
                type="text"
                value={confirm}
                placeholder="Écris SUPPRIMER pour confirmer"
                aria-label="Écris SUPPRIMER pour confirmer"
                autoComplete="off"
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button
                type="submit"
                className="account-btn is-danger"
                isDisabled={confirm !== "SUPPRIMER" || state === "busy"}
              >
                🗑 Tout supprimer
              </Button>
            </form>
            {state === "error" && <p className="notice">La suppression a échoué : réessaie dans un instant.</p>}
          </>
        )}
      </section>
    </>
  );
}
