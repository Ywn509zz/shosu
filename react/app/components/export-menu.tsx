import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { buildExport, EXPORT_FORMATS, saveFile, type ExportFormat, type ExportItem } from "~/lib/export";

/** Bouton « Exporter » : télécharge toute la liste dans un seul fichier (téléchargeur HTML, texte, CSV ou JSON). */
export function ExportMenu({ name, items }: { name: string; items: ExportItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(format: ExportFormat) {
    saveFile(buildExport(format, name, items));
    setOpen(false);
  }

  return (
    <div className="export-menu" ref={ref}>
      <Button
        className="account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        isDisabled={items.length === 0}
        onPress={() => setOpen((value) => !value)}
      >
        ⬇ Exporter la liste
      </Button>
      {open && (
        <div className="pop-menu" role="menu">
          {EXPORT_FORMATS.map((format) => (
            <Button key={format.id} className="pop-item" onPress={() => run(format.id)}>
              <span>{format.label}</span>
              <small>{format.hint}</small>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
