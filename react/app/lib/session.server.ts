import { auth } from "./auth.server";

export type SessionUser = {
  id: string;
  /** Pseudo osu!. */
  name: string;
  image: string | null;
  /** Offre : toujours « free » pour l'instant (comme l'ancienne session). */
  plan: "free";
};

export async function getUser(request: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const { id, name, image } = session.user;
  return { id, name, image: image ?? null, plan: "free" };
}
