import { Button } from "@heroui/react";
import { useState } from "react";
import { useRevalidator } from "react-router";

import type { Collection } from "~/lib/collections";
import {
  ACCENTS,
  BANNERS,
  MAX_BIO,
  MAX_FEATURED,
  type AccentId,
  type BannerId,
  type ProfileCustom,
} from "~/lib/profile-custom";

const ERRORS: Record<string, string> = {
  storage_not_persistent: "Le stockage n'est pas configuré sur ce site.",
  rate_limited: "Trop de modifications d'affilée. Patiente un instant.",
  unauthenticated: "Ta session a expiré. Reconnecte-toi avec osu!.",
};

/** Éditeur du profil shOsu! (biographie, couleur, bannière, collections en vedette) : visible seulement sur son propre profil. */
export function ProfileEditor({
  custom,
  publicCollections,
}: {
  custom: ProfileCustom;
  publicCollections: Collection[];
}) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState(custom.bio);
  const [accent, setAccent] = useState<AccentId>(custom.accent);
  const [banner, setBanner] = useState<BannerId>(custom.banner);
  const [featured, setFeatured] = useState<string[]>(custom.featured);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ bio, accent, banner, featured }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(ERRORS[body?.error ?? ""] ?? "Enregistrement impossible pour le moment.");
        return;
      }
      await revalidator.revalidate();
      setOpen(false);
    } catch {
      setMessage("Enregistrement impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  const toggleFeatured = (id: string) =>
    setFeatured((current) =>
      current.includes(id)
        ? current.filter((c) => c !== id)
        : current.length >= MAX_FEATURED
          ? current
          : [...current, id],
    );

  if (!open) {
    return (
      <div className="profile-edit-btn">
        <Button className="account-btn" onPress={() => setOpen(true)}>
          ✎ Personnaliser mon profil
        </Button>
      </div>
    );
  }

  return (
    <form
      className="profile-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>Personnaliser mon profil shOsu!</h3>

      <label className="field">
        Biographie ({bio.length}/{MAX_BIO})
        <textarea
          value={bio}
          maxLength={MAX_BIO}
          placeholder="Quelques mots sur toi, tes goûts, ton style de jeu…"
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      <fieldset className="field-set">
        <legend className="field">Couleur d'accent</legend>
        <div className="swatches">
          {ACCENTS.map((a) => (
            <label className="swatch" key={a.id} style={{ "--sw": a.color } as React.CSSProperties}>
              <input type="radio" name="accent" checked={accent === a.id} onChange={() => setAccent(a.id)} />
              <i />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field-set">
        <legend className="field">Bannière</legend>
        <div className="swatches">
          {BANNERS.map((b) => (
            <label className="swatch" key={b.id}>
              <input type="radio" name="banner" checked={banner === b.id} onChange={() => setBanner(b.id)} />
              {b.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field-set">
        <legend className="field">
          Collections en vedette ({featured.length}/{MAX_FEATURED})
        </legend>
        {publicCollections.length === 0 ? (
          <p className="skill-note">
            Aucune collection publique : rends une collection publique (bouton « Partager » sur sa page) pour la mettre
            en avant ici.
          </p>
        ) : (
          <div className="swatches">
            {publicCollections.map((c) => (
              <label className="swatch" key={c.id}>
                <input type="checkbox" checked={featured.includes(c.id)} onChange={() => toggleFeatured(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {message && <p className="notice">{message}</p>}
      <div className="editor-actions">
        <Button type="submit" className="account-btn" isDisabled={busy}>
          Enregistrer
        </Button>
        <Button className="account-btn" onPress={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
