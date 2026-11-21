import { Button } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { toTrack } from "~/components/beatmap-card";
import {
  ASSISTANT_LOGO,
  ASSISTANT_NAME,
  ASSISTANT_TAGLINE,
  MAX_MESSAGE_LENGTH,
  SUGGESTIONS,
  type SearchLink,
  type StreamEvent,
  type UiAction,
} from "~/lib/assistant";
import { audioToWav, MAX_FILE_BYTES, MAX_RECORD_SECONDS, useRecorder } from "~/lib/audio";
import { useLists } from "~/lib/lists-context";
import {
  avatarUrl,
  countryFlag,
  coverUrl,
  formatNumber,
  MODE_IDS,
  STATUS_IDS,
  type Beatmapset,
  type PlayerSummary,
} from "~/lib/osu";
import { usePlayer, type Track } from "~/lib/player";
import { useSpeechRecognition } from "~/lib/use-speech-recognition";

type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  cards?: Beatmapset[];
  players?: PlayerSummary[];
  searchLink?: SearchLink | null;
  error?: boolean;
  /** Réponse en cours de réception (non conservée dans le stockage). */
  streaming?: boolean;
  status?: string;
};

const STORAGE_KEY = "stack-chat-v2";
const MAX_STORED = 30;

const ERRORS: Record<string, string> = {
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu! pour continuer.",
  rate_limited: "Tu m'envoies beaucoup de messages ! Patiente quelques minutes avant de réessayer.",
  assistant_unavailable: `${ASSISTANT_NAME} n'est pas encore configuré sur ce site.`,
  ai_unavailable: "L'IA est momentanément indisponible. Réessaie dans un instant.",
  ai_bad_response: "L'IA a renvoyé une réponse inexploitable. Réessaie.",
  invalid_request: "Je n'ai pas pu traiter ce message. Essaie de le reformuler.",
  interrupted: "La réponse a été interrompue. Réessaie.",
  audio_invalid: "Je n'ai pas pu lire cet extrait audio. Essaie un extrait plus long ou un autre fichier.",
  audio_too_large: "Cet extrait est trop volumineux. Essaie un extrait plus court.",
};
const GENERIC_ERROR = "Un problème est survenu. Réessaie dans un instant.";

function searchHref(link: SearchLink) {
  const params = new URLSearchParams({ q: link.q });
  if (link.mode !== "all") params.set("mode", link.mode);
  if (link.status !== "all") params.set("status", link.status);
  return `/?${params}`;
}

/** Les actions viennent du serveur mais sont revalidées ici : on ne navigue que vers nos propres pages. */
function actionUrl(action: UiAction): string | null {
  switch (action.type) {
    case "show_in_search": {
      if (typeof action.q !== "string" || !action.q || action.q.length > 200) return null;
      if (!MODE_IDS.includes(action.mode) || !STATUS_IDS.includes(action.status)) return null;
      return searchHref({ q: action.q, mode: action.mode, status: action.status });
    }
    case "open_beatmap":
      return Number.isInteger(action.id) && action.id > 0 ? `/beatmap/${action.id}` : null;
    case "open_player":
      return Number.isInteger(action.id) && action.id > 0 ? `/player/${action.id}` : null;
    default:
      return null;
  }
}

/** Relit la conversation stockée en écartant tout ce qui n'a pas la bonne forme. */
function restore(raw: string | null): Msg[] {
  try {
    const saved = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(
        (m): m is Msg =>
          !!m && typeof m === "object" && typeof (m as Msg).id === "number" && typeof (m as Msg).text === "string" &&
          ((m as Msg).role === "user" || (m as Msg).role === "assistant"),
      )
      .map((m) => ({ ...m, streaming: false, status: "" }))
      .filter((m) => m.role === "user" || m.text || m.cards?.length || m.players?.length);
  } catch {
    return [];
  }
}

export function Assistant({
  open,
  onClose,
  signedIn,
  pendingAsk,
  onAskConsumed,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  /** Question posée depuis une autre page (« Expliquer avec Stack »), envoyée dès l'ouverture. */
  pendingAsk: string | null;
  onAskConsumed: () => void;
}) {
  const navigate = useNavigate();
  const player = usePlayer();
  const lists = useLists();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [restored, setRestored] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const wasOpen = useRef(false);
  const sendingRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const [listenOpen, setListenOpen] = useState(false);
  const [listenError, setListenError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const identifyRef = useRef<(blob: Blob) => Promise<void>>(async () => {});
  const recorder = useRecorder((blob) => void identifyRef.current(blob));

  const voice = useSpeechRecognition((text) => {
    setInput((prev) => `${prev ? `${prev} ` : ""}${text}`.slice(0, MAX_MESSAGE_LENGTH));
    inputRef.current?.focus();
  });

  // La conversation survit à un rechargement de la page (onglet courant seulement).
  useEffect(() => {
    try {
      const saved = restore(sessionStorage.getItem(STORAGE_KEY));
      setMessages(saved);
      nextId.current = saved.reduce((max, m) => Math.max(max, m.id), 0) + 1;
    } catch {
      /* stockage indisponible : on repart d'une conversation vide */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored || sending) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      /* ignoré */
    }
  }, [messages, restored, sending]);

  // Focus à l'ouverture, retour sur le bouton à la fermeture.
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 320);
      wasOpen.current = true;
      return () => window.clearTimeout(timer);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      document.getElementById("assistant-toggle")?.focus();
    }
  }, [open]);

  // Pendant la réponse on suit le bas ; une fois terminée on montre son DÉBUT (le texte avant les cartes).
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.streaming && !last.error) {
      log.querySelector<HTMLElement>(`[data-msg-id="${last.id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      log.scrollTo({ top: log.scrollHeight, behavior: last?.streaming ? "auto" : "smooth" });
    }
  }, [messages, open]);

  // Annule une requête en cours si le composant disparaît.
  useEffect(() => () => abortRef.current?.abort(), []);

  const closeIfSmall = useCallback(() => {
    if (window.innerWidth < 700) onClose();
  }, [onClose]);

  /**
   * Envoie un message (ou un extrait audio) et lit la réponse en flux. `request` fait l'appel réseau ;
   * le reste (affichage progressif, cartes, actions sur la page) est commun à Stack et à l'écoute.
   */
  const converse = useCallback(
    async (userText: string, request: (signal: AbortSignal) => Promise<Response>) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);

      const userMsg: Msg = { id: nextId.current++, role: "user", text: userText };
      const botId = nextId.current++;

      setMessages((prev) => [...prev, userMsg, { id: botId, role: "assistant", text: "", streaming: true }]);

      const patchBot = (change: (m: Msg) => Msg) =>
        setMessages((prev) => prev.map((m) => (m.id === botId ? change(m) : m)));
      const fail = (code: string) =>
        patchBot((m) =>
          m.text
            ? { ...m, streaming: false, status: "", text: `${m.text}\n\n⚠ ${ERRORS[code] ?? GENERIC_ERROR}` }
            : { ...m, streaming: false, status: "", error: true, text: ERRORS[code] ?? GENERIC_ERROR },
        );

      const controller = new AbortController();
      abortRef.current = controller;
      let navigation: UiAction | null = null;
      let listsChanged = false;
      let finished = false;

      try {
        const response = await request(controller.signal);

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          fail(body?.error ?? "");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handle = (event: StreamEvent) => {
          switch (event.t) {
            case "status":
              patchBot((m) => ({ ...m, status: event.text }));
              break;
            case "delta":
              patchBot((m) => ({ ...m, status: "", text: m.text + event.text }));
              break;
            case "cards":
              patchBot((m) => {
                const seen = new Set((m.cards ?? []).map((c) => c.id));
                return { ...m, cards: [...(m.cards ?? []), ...event.items.filter((c) => !seen.has(c.id))] };
              });
              break;
            case "players":
              patchBot((m) => {
                const seen = new Set((m.players ?? []).map((p) => p.id));
                return { ...m, players: [...(m.players ?? []), ...event.items.filter((p) => !seen.has(p.id))] };
              });
              break;
            case "link":
              patchBot((m) => ({ ...m, searchLink: event.link }));
              break;
            case "action":
              if (event.action.type === "lists_changed") listsChanged = true;
              else navigation = event.action; // la dernière demande l'emporte
              break;
            case "done":
              finished = true;
              break;
            case "error":
              finished = true;
              fail(event.code);
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handle(JSON.parse(line) as StreamEvent);
            } catch {
              /* ligne illisible : ignorée */
            }
          }
        }

        if (!finished) fail("interrupted");
        else patchBot((m) => (m.error ? m : { ...m, streaming: false, status: "" }));

        if (listsChanged) void lists.refresh();
        const url = navigation ? actionUrl(navigation) : null;
        if (url) {
          void navigate(url);
          closeIfSmall();
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") fail("");
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [lists, navigate, closeIfSmall],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text || sendingRef.current) return;

      const prior = messagesRef.current
        .filter((m) => !m.error && m.text)
        .slice(-11)
        .map((m) => ({
          role: m.role,
          text: m.text,
          ...(m.role === "assistant" && m.cards?.length ? { cardIds: m.cards.map((c) => c.id) } : {}),
        }));
      const history = [...prior, { role: "user" as const, text }];

      setInput("");
      await converse(text, (signal) =>
        fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({ messages: history }),
          signal,
        }),
      );
    },
    [converse],
  );

  /** « Shazam pour osu! » : convertit l'extrait en petit WAV et le fait écouter à Gemini. */
  const identify = useCallback(
    async (blob: Blob) => {
      if (sendingRef.current) return;
      setListenError("");

      let converted: { wav: Blob; seconds: number };
      try {
        converted = await audioToWav(blob);
      } catch {
        setListenError("Je n'ai pas pu lire cet audio. Essaie un autre fichier ou un enregistrement plus long.");
        return;
      }

      setListenOpen(false);
      await converse(`🎧 Extrait audio (${Math.round(converted.seconds)} s)`, (signal) =>
        fetch("/api/listen", {
          method: "POST",
          headers: { "Content-Type": "audio/wav", Accept: "application/x-ndjson" },
          body: converted.wav,
          signal,
        }),
      );
    },
    [converse],
  );
  identifyRef.current = identify;

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permet de rechoisir le même fichier
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setListenError("Ce fichier est trop volumineux (30 Mo maximum).");
      return;
    }
    if (file.type && !file.type.startsWith("audio/")) {
      setListenError("Ce fichier n'est pas un fichier audio.");
      return;
    }
    void identify(file);
  }

  // Question posée depuis une autre page : envoyée dès que le panneau est prêt.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!pendingAsk || !restored) return;
    onAskConsumed();
    if (signedIn) void sendRef.current(pendingAsk);
  }, [pendingAsk, restored, signedIn, onAskConsumed]);

  function newConversation() {
    abortRef.current?.abort();
    sendingRef.current = false;
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

  const playQueue = (cards: Beatmapset[]) => cards.map(toTrack).filter((t): t is Track => t !== null);

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
            Je suis <strong translate="no">{ASSISTANT_NAME}</strong>. Je cherche des beatmaps pour toi, je retrouve des
            joueurs et je t'aide à progresser selon ton profil osu!. Connecte-toi pour discuter avec moi.
          </p>
          <a className="account-btn" href="/api/auth/login">
            Se connecter avec osu!
          </a>
        </div>
      ) : (
        <>
          <div className="assistant-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && (
              <p className="assistant-welcome">
                Salut, je suis <strong translate="no">{ASSISTANT_NAME}</strong> ! Dis-moi ce que tu veux jouer : je lance les
                recherches pour toi, je regarde ton profil pour te proposer des maps à ton niveau, et je peux aussi t'expliquer une
                beatmap, retrouver un joueur ou gérer tes listes.
              </p>
            )}

            {messages.map((m) => (
              <div className="assistant-block" key={m.id} data-msg-id={m.id}>
                {m.role === "assistant" && m.streaming && !m.text ? (
                  <div className="assistant-typing" role="status" aria-label={m.status || `${ASSISTANT_NAME} réfléchit`}>
                    <i />
                    <i />
                    <i />
                    {m.status && <span>{m.status}</span>}
                  </div>
                ) : (
                  <div
                    className={`assistant-msg is-${m.role}${m.error ? " is-error" : ""}${m.streaming ? " is-streaming" : ""}`}
                  >
                    {m.text}
                  </div>
                )}

                {m.cards?.map((card) => (
                  <article className="assistant-card" key={`b${card.id}`}>
                    <img src={coverUrl(card.id)} alt="" loading="lazy" width={52} height={52} />
                    <div className="assistant-card-body">
                      <Link to={`/beatmap/${card.id}`} onClick={closeIfSmall}>
                        {card.title}
                      </Link>
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
                        aria-label={`${player.isPlaying(card.id) ? "Pause" : "Écouter"} l'aperçu de ${card.title}`}
                        aria-pressed={player.isPlaying(card.id)}
                        onPress={() => {
                          const track = toTrack(card);
                          if (track) player.toggle(track, playQueue(m.cards ?? []));
                        }}
                      >
                        {player.isPlaying(card.id) ? "⏸" : "▶"}
                      </Button>
                    )}
                  </article>
                ))}

                {m.players?.map((p) => (
                  <article className="assistant-card is-player" key={`p${p.id}`}>
                    <img src={avatarUrl(p.id)} alt="" loading="lazy" width={52} height={52} />
                    <div className="assistant-card-body">
                      <Link to={`/player/${p.id}`} onClick={closeIfSmall} translate="no">
                        {countryFlag(p.country)} {p.username}
                      </Link>
                      <p>
                        {p.globalRank ? `#${formatNumber(p.globalRank)} mondial` : p.countryRank ? `#${formatNumber(p.countryRank)} ${p.country}` : "Non classé"}
                        {p.globalRank && p.countryRank ? ` · #${formatNumber(p.countryRank)} ${p.country}` : ""}
                      </p>
                      <small>
                        {p.pp !== null ? `${formatNumber(p.pp)} pp` : ""}
                        {p.accuracy !== null ? ` · ${p.accuracy.toFixed(2)} %` : ""}
                      </small>
                    </div>
                  </article>
                ))}

                {m.searchLink && m.cards && m.cards.length > 0 && !m.streaming && (
                  <Link className="assistant-open-link" to={searchHref(m.searchLink)} onClick={closeIfSmall}>
                    Voir dans la recherche ↗
                  </Link>
                )}
              </div>
            ))}
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
            {listenOpen && (
              <div className="assistant-listen" id="assistant-listen">
                <p>
                  <strong>🎧 Quel est ce son ?</strong> Fais-moi écouter un morceau ou importe un fichier : je cherche les maps
                  qui l'ont, ou qui s'en rapprochent.
                </p>
                {recorder.recording ? (
                  <div className="assistant-rec" role="status">
                    <span className="rec-dot" aria-hidden />
                    <span>
                      Écoute en cours… {Math.floor(recorder.seconds)} / {MAX_RECORD_SECONDS} s
                    </span>
                    <Button className="assistant-chip" onPress={recorder.stop}>
                      Terminer
                    </Button>
                    <Button className="assistant-chip" onPress={recorder.cancel}>
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <div className="assistant-listen-actions">
                    {recorder.supported !== false && (
                      <Button
                        className="assistant-chip"
                        isDisabled={sending}
                        onPress={() => {
                          setListenError("");
                          void recorder.start();
                        }}
                      >
                        🎤 Écouter ({MAX_RECORD_SECONDS} s)
                      </Button>
                    )}
                    <Button className="assistant-chip" isDisabled={sending} onPress={() => fileRef.current?.click()}>
                      📁 Importer un fichier
                    </Button>
                    <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFileChosen} />
                  </div>
                )}
                {(listenError || recorder.error) && (
                  <p className="assistant-listen-error" role="alert">
                    {listenError || recorder.error}
                  </p>
                )}
                <p className="assistant-note">
                  L'extrait (30 s maximum) est envoyé à Gemini (Google) pour analyse ; shOsu! ne le conserve pas.
                </p>
              </div>
            )}
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
                className={`assistant-mic${listenOpen ? " is-listening" : ""}`}
                aria-label="Identifier un son (Shazam pour osu!)"
                aria-expanded={listenOpen}
                aria-controls="assistant-listen"
                onPress={() => {
                  setListenOpen((open) => !open);
                  setListenError("");
                }}
              >
                🎧
              </Button>
              {voice.supported !== false && (
                <Button
                  className={`assistant-mic${voice.listening ? " is-listening" : ""}`}
                  aria-label={voice.listening ? "Arrêter la dictée" : "Dicter un message"}
                  aria-pressed={voice.listening}
                  onPress={voice.toggle}
                >
                  🎙️
                </Button>
              )}
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
              Propulsé par Gemini (Google). {ASSISTANT_NAME} lit ton profil osu! public pour t'aider, ne retient rien côté serveur et
              peut se tromper.
            </p>
          </form>
        </>
      )}
    </aside>
  );
}
