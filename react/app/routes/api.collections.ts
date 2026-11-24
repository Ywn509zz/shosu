import { data } from "react-router";

import { COLLECTION_ID_PATTERN } from "~/lib/collections";
import {
  CollectionFullError,
  CollectionLimitError,
  CollectionNotFoundError,
  addToCollection,
  cloneCollection,
  createCollection,
  deleteCollection,
  listCollections,
  membership,
  removeFromCollection,
  updateCollection,
} from "~/lib/collections.server";
import { OsuError } from "~/lib/osu.server";
import { PLANS } from "~/lib/plans";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";
import { isPersistent } from "~/lib/store.server";

import type { Route } from "./+types/api.collections";

const headers = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 1_000;
const WRITE_LIMIT = { limit: 200, windowMs: 10 * 60_000 };

const fail = (code: string, status: number, extra: Record<string, unknown> = {}) =>
  data({ error: code, ...extra }, { status, headers });

const validSetId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000_000;

/** GET /api/collections[?set=<id>] : mes collections (avec, pour une beatmap, celles qui la contiennent). */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.osuId) return fail("unauthenticated", 401);

  const setParam = new URL(request.url).searchParams.get("set");
  const plan = PLANS[user.plan];
  try {
    if (setParam !== null) {
      const setId = Number(setParam);
      if (!validSetId(setId)) return fail("invalid_request", 400);
      const rows = await membership(user.osuId, setId);
      return data(
        {
          persistent: isPersistent(),
          limit: plan.collectionLimit,
          collections: rows.map(({ collection, has }) => ({ id: collection.id, name: collection.name, count: collection.count, has })),
        },
        { headers },
      );
    }
    const collections = await listCollections(user.osuId);
    return data({ persistent: isPersistent(), limit: plan.collectionLimit, collections }, { headers });
  } catch {
    return fail("storage_unavailable", 503);
  }
}

/**
 * POST /api/collections
 *   { action: "create", name }            { action: "rename", id, name }      { action: "share", id, public }
 *   { action: "delete", id }              { action: "add" | "remove", id, setId }      { action: "clone", id }
 */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return fail("forbidden", 403);

  const user = await getUser(request);
  if (!user?.osuId) return fail("unauthenticated", 401);
  if (!isPersistent()) return fail("storage_not_persistent", 503);

  const hit = await rateLimit(`collections:${user.id}`, WRITE_LIMIT.limit, WRITE_LIMIT.windowMs);
  if (!hit.ok) return fail("rate_limited", 429);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 413);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fail("invalid_request", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("invalid_request", 400);
  }

  const plan = PLANS[user.plan];
  const owner = { osuId: user.osuId, name: user.name };
  const id = typeof body.id === "string" ? body.id : "";
  const needsId = body.action !== "create";
  if (needsId && !COLLECTION_ID_PATTERN.test(id)) return fail("invalid_request", 400);

  try {
    switch (body.action) {
      case "create": {
        const collection = await createCollection(owner, String(body.name ?? ""), plan.collectionLimit);
        return data({ ok: true, collection }, { headers });
      }
      case "rename": {
        const collection = await updateCollection(user.osuId, id, { name: String(body.name ?? "") });
        return data({ ok: true, collection }, { headers });
      }
      case "share": {
        if (typeof body.public !== "boolean") return fail("invalid_request", 400);
        const collection = await updateCollection(user.osuId, id, { public: body.public });
        return data({ ok: true, collection }, { headers });
      }
      case "delete":
        await deleteCollection(user.osuId, id);
        return data({ ok: true }, { headers });
      case "add": {
        if (!validSetId(body.setId)) return fail("invalid_request", 400);
        const collection = await addToCollection(user.osuId, id, body.setId, plan.listLimit);
        return data({ ok: true, collection }, { headers });
      }
      case "remove": {
        if (!validSetId(body.setId)) return fail("invalid_request", 400);
        const collection = await removeFromCollection(user.osuId, id, body.setId);
        return data({ ok: true, collection }, { headers });
      }
      case "clone": {
        const collection = await cloneCollection(owner, id, { collections: plan.collectionLimit, items: plan.listLimit });
        return data({ ok: true, collection }, { headers });
      }
      default:
        return fail("invalid_request", 400);
    }
  } catch (error) {
    if (error instanceof CollectionLimitError) return fail("collection_limit", 409, { plan: user.plan, limit: plan.collectionLimit });
    if (error instanceof CollectionFullError) return fail("list_full", 409, { plan: user.plan, limit: plan.listLimit });
    if (error instanceof CollectionNotFoundError) return fail("not_found", 404);
    if (error instanceof OsuError && error.status === 404) return fail("beatmap_not_found", 404);
    if (error instanceof Error && error.message === "invalid_name") return fail("invalid_name", 400);
    console.error("Collections error:", error instanceof Error ? error.name : "Error");
    return fail("storage_unavailable", 503);
  }
}
