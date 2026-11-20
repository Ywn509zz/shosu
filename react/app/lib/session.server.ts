import { auth } from "./auth.server";

export type SessionUser = {
  id: string;
  /** Pseudo osu!. */
  name: string;
  image: string | null;
  /** Identifiant osu! (public). */
  osuId: number | null;
  /** Offre : toujours « free » pour l'instant (comme l'ancienne session). */
  plan: "free";
};

export async function getUser(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const { id, name, image, email } = session.user;
  // L'e-mail est celui fabriqué dans auth.server.ts (`<id osu!>@users.osu.invalid`),
  // lu depuis le cookie chiffré : il ne vient jamais d'une saisie utilisateur.
  const osuId = Number(/^(\d+)@users\.osu\.invalid$/.exec(email)?.[1]) || null;
  return { id, name, image: image ?? null, osuId, plan: "free" };
}
