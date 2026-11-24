import { useState } from "react";

import { avatarUrl } from "~/lib/osu";

/**
 * Photo de profil d'un compte osu! (`https://a.ppy.sh/<id>`, autorisée par la CSP). Si l'image ne charge pas
 * (réseau, compte sans photo), on retombe sur l'initiale du pseudo. L'élément a toujours la même taille : pas de saut de mise en page.
 */
export function Avatar({
  id,
  name,
  size = 30,
  className = "",
}: {
  id: number | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.42) };

  if (!id || failed) {
    return (
      <span className={`avatar is-letter ${className}`.trim()} style={style} aria-hidden>
        {name.slice(0, 1).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <img
      className={`avatar ${className}`.trim()}
      src={avatarUrl(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
