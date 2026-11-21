import { Button } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import {
  ASSISTANT_LOGO,
  ASSISTANT_NAME,
  ASSISTANT_TAGLINE,
  MAX_MESSAGE_LENGTH,
  SUGGESTIONS,
  type AssistantReply,
  type SearchLink,
} from "~/lib/assistant";
import { beatmapsetUrl, coverUrl, type Beatmapset } from "~/lib/osu";
import { useAudioPreview } from "~/lib/use-audio-preview";

type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  cards?: Beatmapset[];
  searchLink?: SearchLink | null;
  error?: boolean;
};

const STORAGE_KEY = "stack-chat-v1";
const MAX_STORED = 30;

const ERRORS: Record<string, string> = {
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu! pour continuer.",
  rate_limited: "Tu m'envoies beaucoup de messages ! Patiente quelques minutes avant de réessayer.",
  assistant_unavailable: `${ASSISTANT_NAME} n'est pas encore configuré sur ce site.`,
  ai_unavailable: "L'IA est momentanément indisponible. Réessaie dans un instant.",
  ai_bad_response: "L'IA a renvoyé une réponse inexploitable. Réessaie.",
  invalid_request: "Je n'ai pas pu traiter ce message. Essaie de le reformuler.",
};
const GENERIC_ERROR = "Un problème est survenu. Réessaie dans un instant.";

function searchHref(link: SearchLink) {
  const params = new URLSearchParams({ q: link.q });
  if (link.mode !== "all") params.set("mode", link.mode);
  if (link.status !== "all") params.set("status", link.status);
  return `/?${params}`;
}

export function Assistant({
  open,
  onClose,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [restored, setRestored] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const wasOpen = useRef(false);
  const { playingId, toggle: togglePreview, stop } = useAudioPreview();

  // La conversation survit à un rechargement de la page (onglet courant seulement).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as Msg[];
      if (Array.isArray(saved)) {
        setMessages(saved);
        nextId.current = saved.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      }
    } catch {
      /* stockage indisponible : on repart d'une conversation vide */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      /* ignoré */
    }
  }, [messages, restored]);

  // Focus à l'ouverture, retour sur le bouton à la fermeture.
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 320);
      wasOpen.current = true;
      return () => window.clearTimeout(timer);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      stop();
      document.getElementById("assistant-toggle")?.focus();
    }
  }, [open, stop]);

  // Nouvelle réponse : on montre son DÉBUT (le texte avant les cartes) ; sinon on suit le bas.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !sending) {
      log.querySelector<HTMLElement>(`[data-msg-id="${last.id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending, open]);

  // Annule une requête en cours si le composant disparaît.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text || sending) return;

      const userMsg: Msg = { id: nextId.current++, role: "user", text };
      const history = [...messages, userMsg]
        .filter((m) => !m.error)
        .slice(-12)
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | (AssistantReply & { error?: string })
          | null;

        if (!response.ok || !body || body.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId.current++,
              role: "assistant",
              text: ERRORS[body?.error ?? ""] ?? GENERIC_ERROR,
              error: true,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId.current++,
              role: "assistant",
              text: body.reply,
              cards: body.cards,
              searchLink: body.searchLink,
            },
          ]);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          { id: nextId.current++, role: "assistant", text: GENERIC_ERROR, error: true },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending],
  );

  function newConversation() {
    abortRef.current?.abort();
    stop();
    setMessages([]);
    setSending(false);
    setInput("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignoré */
    }
    inputRef.current?.focus();
  }

  return (
    <aside
      id="assistant-panel"
      className="assistant-panel"
      data-open={open}
      role="complementary"
      aria-label={`${ASSISTANT_NAME}, ${ASSISTANT_TAGLINE.toLowerCase()}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className="assistant-head">
        <img className="assistant-avatar" src={ASSISTANT_LOGO} alt="" width={40} height={40} />
        <div className="assistant-title">
          <strong translate="no">{ASSISTANT_NAME}</strong>
          <span>{ASSISTANT_TAGLINE}</span>
        </div>
        {messages.length > 0 && (
          <Button aria-label="Nouvelle conversation" onPress={newConversation}>
            ↺
          </Button>
        )}
        <Button aria-label={`Fermer ${ASSISTANT_NAME}`} onPress={onClose}>
          ✕
        </Button>
      </header>

      {!signedIn ? (
        <div className="assistant-login">
          <p>
            Je suis <strong translate="no">{ASSISTANT_NAME}</strong>. Je cherche des beatmaps pour toi et je t'aide à
            progresser selon ton profil osu!. Connecte-toi pour discuter avec moi.
          </p>
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      ) : (
        <>
          <div className="assistant-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && (
              <p className="assistant-welcome">
                Salut, je suis <strong translate="no">{ASSISTANT_NAME}</strong> ! Dis-moi ce que tu veux jouer : je
                lance les recherches pour toi, ou je regarde ton profil pour te proposer des maps à ton niveau.
              </p>
            )}

            {messages.map((m) => (
              <div className="assistant-block" key={m.id} data-msg-id={m.id}>
                <div className={`assistant-msg is-${m.role}${m.error ? " is-error" : ""}`}>{m.text}</div>

                {m.cards && m.cards.length > 0 && (
                  <>
                    {m.cards.map((card) => (
                      <article className="assistant-card" key={card.id}>
                        <img src={coverUrl(card.id)} alt="" loading="lazy" width={52} height={52} />
                        <div className="assistant-card-body">
                          <a href={beatmapsetUrl(card.id)} target="_blank" rel="noopener noreferrer">
                            {card.title}
                          </a>
                          <p>
                            {card.artist} · {card.creator}
                          </p>
                          {card.minStars !== null && card.maxStars !== null && (
                            <small>
                              ⭐ {card.minStars.toFixed(1)}
                              {Math.abs(card.maxStars - card.minStars) >= 0.05 ? ` – ${card.maxStars.toFixed(1)}` : ""}
                            </small>
                          )}
                        </div>
                        {card.previewFile && (
                          <Button
                            className="assistant-play"
                            aria-label={`${playingId === card.id ? "Pause" : "Écouter"} l'aperçu de ${card.title}`}
                            aria-pressed={playingId === card.id}
                            onPress={() => togglePreview(card.id, card.previewFile!)}
                          >
                            {playingId === card.id ? "⏸" : "▶"}
                          </Button>
                        )}
                      </article>
                    ))}
                    {m.searchLink && (
                      <Link
                        className="assistant-open-link"
                        to={searchHref(m.searchLink)}
                        onClick={() => {
                          if (window.innerWidth < 700) onClose();
                        }}
                      >
                        Voir dans la recherche ↗
                      </Link>
                    )}
                  </>
                )}
              </div>
            ))}

            {sending && (
              <div className="assistant-typing" role="status" aria-label={`${ASSISTANT_NAME} réfléchit`}>
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div className="assistant-chips">
              {SUGGESTIONS.map((suggestion) => (
                <Button key={suggestion} className="assistant-chip" onPress={() => void send(suggestion)}>
                  {suggestion}
                </Button>
              ))}
            </div>
          )}

          <form
            className="assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="assistant-input-row">
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder={`Demande quelque chose à ${ASSISTANT_NAME}…`}
                aria-label={`Message pour ${ASSISTANT_NAME}`}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <Button
                type="submit"
                className="assistant-send"
                aria-label="Envoyer"
                isDisabled={sending || input.trim().length === 0}
              >
                ➤
              </Button>
            </div>
            <p className="assistant-note">
              Propulsé par Gemini (Google). {ASSISTANT_NAME} lit ton profil osu! public pour t'aider, ne retient rien côté serveur
              et peut se tromper.
            </p>
          </form>
        </>
      )}
    </aside>
  );
}
