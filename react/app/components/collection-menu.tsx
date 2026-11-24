import { Button } from "@heroui/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import { callCollections } from "~/lib/collections-client";
import { collectionPath } from "~/lib/collections";

type Row = { id: string; name: string; count: number; has: boolean };
type Loaded = { collections: Row[]; limit: number };

/**
 * Bouton « Ajouter à une collection » d'une beatmap : ouvre une petite fenêtre avec les collections du joueur
 * (cases à cocher) et un champ pour en créer une. La fenêtre est posée dans <body> : les cartes coupent ce qui dépasse.
 */
export function CollectionMenu({ id }: { id: number }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(280, window.innerWidth - 16);
    setPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 120),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, data]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/collections?set=${id}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      setData((await response.json()) as Loaded);
    } catch {
      setData(null);
      setMessage("Impossible de charger tes collections pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  async function toggle(row: Row) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = await callCollections({ action: row.has ? "remove" : "add", id: row.id, setId: id });
    if (result.ok) {
      setData((d) =>
        d
          ? {
              ...d,
              collections: d.collections.map((c) =>
                c.id === row.id ? { ...c, has: !row.has, count: result.collection?.count ?? c.count } : c,
              ),
            }
          : d,
      );
    } else setMessage(result.message);
    setBusy(false);
  }

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setMessage("");
    const created = await callCollections({ action: "create", name });
    if (created.ok && created.collection) {
      const added = await callCollections({ action: "add", id: created.collection.id, setId: id });
      setName("");
      if (!added.ok) setMessage(added.message);
      await load();
    } else if (!created.ok) setMessage(created.message);
    setBusy(false);
  }

  return (
    <>
      <div className="collection-trigger" ref={buttonRef}>
        <Button
          className={`icon-btn${data?.collections.some((c) => c.has) ? " is-on" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Ajouter à une collection"
          onPress={toggleOpen}
        >
          <span aria-hidden>📁</span>
        </Button>
      </div>
      {open &&
        position &&
        createPortal(
          <div
            ref={popRef}
            className="pop-menu collection-pop"
            role="dialog"
            aria-label="Collections"
            style={{ top: position.top, left: position.left }}
          >
            <p className="pop-title">Ajouter à une collection</p>
            {loading && !data && <p className="pop-note">Chargement…</p>}
            {data && data.collections.length === 0 && (
              <p className="pop-note">Aucune collection pour l'instant : crée la première ci-dessous.</p>
            )}
            {data?.collections.map((row) => (
              <label className="pop-check" key={row.id}>
                <input type="checkbox" checked={row.has} disabled={busy} onChange={() => void toggle(row)} />
                <span>{row.name}</span>
                <small>{row.count}</small>
                <Link to={collectionPath(row.id)} aria-label={`Ouvrir ${row.name}`}>
                  ↗
                </Link>
              </label>
            ))}
            {data && (
              <form
                className="pop-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  void create();
                }}
              >
                <input
                  type="text"
                  value={name}
                  maxLength={60}
                  placeholder={data.collections.length >= data.limit ? "Limite atteinte" : "Nouvelle collection…"}
                  aria-label="Nom de la nouvelle collection"
                  disabled={busy || data.collections.length >= data.limit}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  type="submit"
                  className="account-btn"
                  isDisabled={busy || !name.trim() || data.collections.length >= data.limit}
                >
                  Créer
                </Button>
              </form>
            )}
            {message && <p className="pop-error">{message}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
