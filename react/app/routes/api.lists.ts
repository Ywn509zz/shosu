import { data } from "react-router";

import { isListId, type ListId } from "~/lib/lists";
import { addToList, getListIds, ListFullError, removeFromList } from "~/lib/lists.server";
import { OsuError } from "~/lib/osu.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/api.lists";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 500;
const WRITE_LIMIT = { limit: 120, windowMs: 10 * 60_000 };

const fail = (code: string, status: number) => data({ error: code }, { status, headers });

/** GET /api/lists : identifiants présents dans les listes du joueur connecté. */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.osuId) return fail("unauthenticated", 401);

  try {
    return data({ persistent: isPersistent(), lists: await getListIds(user.osuId) }, { headers });
  } catch {
    return fail("storage_unavailable", 503);
  }
}

/** POST /api/lists  { action: "add" | "remove", list, id } */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user?.osuId) return fail("unauthenticated", 401);

  const hit = await rateLimit(`lists:${user.id}`, WRITE_LIMIT.limit, WRITE_LIMIT.windowMs);
  if (!hit.ok) return fail("rate_limited", 429);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 413);
  let body: { action?: unknown; list?: unknown; id?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid_request", 400);
  }

  const id = body.id;
  if (
    (body.action !== "add" && body.action !== "remove") ||
    !isListId(body.list) ||
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    id < 1 ||
    id > 1_000_000_000
  ) {
    return fail("invalid_request", 400);
  }
  const list: ListId = body.list;

  try {
    if (body.action === "add") await addToList(user.osuId, list, id);
    else await removeFromList(user.osuId, list, id);
    return data({ ok: true, list, id, inList: body.action === "add" }, { headers });
  } catch (error) {
    if (error instanceof ListFullError) return fail("list_full", 409);
    if (error instanceof OsuError && error.status === 404) return fail("beatmap_not_found", 404);
    console.error("Lists error:", error instanceof Error ? error.name : "Error");
    return fail("storage_unavailable", 503);
  }
}
