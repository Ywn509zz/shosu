import { Button } from "@heroui/react";
import { useState } from "react";

import { BeatmapCard } from "~/components/beatmap-card";
import { MAX_PREFERENCES_LENGTH, type AdvisorResult } from "~/lib/advisor";
import { getUser } from "~/lib/session.server";
import { useAudioPreview } from "~/lib/use-audio-preview";

import type { Route } from "./+types/advisor";

export const meta: Route.MetaFunction = () => [{ title: "Conseiller IA — shOsu!" }];

export async function loader({ request }: Route.LoaderArgs) {
  return { signedIn: Boolean(await getUser(request)) };
}

const MODES = [
  { value: "osu", label: "Standard" },
  { value: "taiko", label: "Taiko" },
  { value: "fruits", label: "fruits" },
  { value: "mania", label: "Mania" },
];

const ERRORS: Record<string, string> = {
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu! pour continuer.",
  rate_limited: "Tu as fait beaucoup de demandes. Patiente quelques minutes avant de réessayer.",
  profile_not_found: "Impossible de lire ton profil osu! pour ce mode. Essaie un autre mode.",
  advisor_unavailable: "Le conseiller n'est pas encore configuré sur ce site.",
  ai_unavailable: "Gemini est momentanément indisponible. Réessaie dans un instant.",
  ai_bad_response: "Gemini a renvoyé une réponse inexploitable. Réessaie.",
  invalid_request: "La demande est invalide. Vérifie tes préférences (400 caractères maximum).",
};
const GENERIC_ERROR = "Le conseiller a rencontré un problème. Réessaie dans un instant.";

type Phase = "idle" | "loading" | "done" | "error";

export default function Advisor({ loaderData }: Route.ComponentProps) {
  const [mode, setMode] = useState("osu");
  const [preferences, setPreferences] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState("");
  const { playingId, toggle: togglePreview, stop } = useAudioPreview();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "loading") return;
    stop();
    setPhase("loading");
    setError("");

    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ mode, preferences }),
      });
      const body = (await response.json().catch(() => null)) as
        | (AdvisorResult & { error?: string })
        | null;

      if (!response.ok || !body || body.error) {
        setError(ERRORS[body?.error ?? ""] ?? GENERIC_ERROR);
        setPhase("error");
        return;
      }
      setResult(body);
      setPhase("done");
    } catch {
      setError(GENERIC_ERROR);
      setPhase("error");
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">CONSEILLER IA</p>
        <h1>Des beatmaps taillés pour ton niveau.</h1>
        <p className="hero-copy">
          Gemini analyse tes meilleurs scores osu! et tes envies pour te proposer de vraies
          beatmaps à jouer.
        </p>
      </section>

      {!loaderData.signedIn ? (
        <div className="advisor-panel advisor-login">
          <p>Connecte-toi avec osu! pour obtenir des conseils basés sur tes statistiques.</p>
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      ) : (
        <form className="advisor-panel" onSubmit={submit}>
          <div className="advisor-row">
            <label htmlFor="advisor-mode">Mode :</label>
            <select id="advisor-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value} translate="no">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <label className="advisor-label" htmlFor="advisor-prefs">
            Tes préférences <span>(facultatif)</span>
          </label>
          <textarea
            id="advisor-prefs"
            value={preferences}
            maxLength={MAX_PREFERENCES_LENGTH}
            placeholder="Ex. : j'aime le stream et les musiques japonaises, je veux progresser en précision…"
            onChange={(e) => setPreferences(e.target.value)}
          />

          <div className="advisor-actions">
            <Button type="submit" className="account-btn advisor-submit" isPending={phase === "loading"}>
              ✨ Obtenir mes conseils
            </Button>
            <small>
              {preferences.length}/{MAX_PREFERENCES_LENGTH}
            </small>
          </div>

          <p className="advisor-note">
            Tes statistiques publiques osu! et ce texte sont envoyés à l'API Gemini de Google pour
            générer les conseils. shOsu! ne les enregistre pas.
          </p>
          {phase === "error" && (
            <p className="advisor-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      {phase === "loading" && <div className="spinner" role="status" aria-label="Analyse en cours" />}

      {phase === "done" && result && (
        <div className="advisor-result" aria-live="polite">
          <div className="advisor-summary">
            <p className="eyebrow">TON PROFIL</p>
            <p>{result.summary}</p>
            <p className="advisor-range">
              Difficulté visée : ⭐ {result.range.min.toFixed(1)} – {result.range.max.toFixed(1)}
            </p>
            {result.tips.length > 0 && (
              <ul>
                {result.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
          </div>

          {result.groups.length === 0 && (
            <p className="advisor-foot">
              Aucune beatmap correspondante n'a été trouvée. Précise tes préférences et réessaie.
            </p>
          )}

          {result.groups.map((group) => (
            <section className="advisor-group" key={group.query}>
              <h2>{group.query}</h2>
              <p>{group.reason}</p>
              <div className="results-grid">
                {group.results.map((mapset) => (
                  <BeatmapCard
                    key={mapset.id}
                    mapset={mapset}
                    isPlaying={playingId === mapset.id}
                    onTogglePreview={togglePreview}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="advisor-foot">
            Conseils générés par l'IA ({result.model}) : ils peuvent contenir des erreurs.
          </p>
        </div>
      )}
    </>
  );
}
