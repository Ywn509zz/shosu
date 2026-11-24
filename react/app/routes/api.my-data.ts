import { data } from "react-router";

import { deleteMyData, exportMyData } from "~/lib/my-data.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getUser } from "~/lib/session.server";

import type { Route } from "./+types/api.my-data";

const noStore = { "Cache-Control": "private, no-store" };

/** GET /api/my-data — télécharge TOUTES les données de shOsu! du joueur connecté (JSON). */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers: noStore });

  const hit = await rateLimit(`mydata-export:${user.id}`, 10, 60 * 60_000, false);
  if (!hit.ok) return data({ error: "rate_limited" }, { status: 429, headers: noStore });

  try {
    const body = JSON.stringify(await exportMyData(user.osuId, user.name), null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="shosu-mes-donnees.json"',
        ...noStore,
      },
    });
  } catch {
    return data({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}

/** POST /api/my-data { action: "delete", confirm: "SUPPRIMER" } — supprime les données du joueur connecté (définitif). */
export async function action({ request }: Route.ActionArgs) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return data({ error: "forbidden" }, { status: 403, headers: noStore });

  const user = await getUser(request);
  if (!user?.osuId) return data({ error: "unauthenticated" }, { status: 401, headers: noStore });

  const hit = await rateLimit(`mydata-delete:${user.id}`, 5, 60 * 60_000, false);
  if (!hit.ok) return data({ error: "rate_limited" }, { status: 429, headers: noStore });

  const raw = await request.text();
  let body: { action?: unknown; confirm?: unknown } = {};
  try {
    body = raw.length <= 200 ? JSON.parse(raw) : {};
  } catch {
    return data({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  // Double sécurité : le mot exact doit être renvoyé (la page le fait taper à l'utilisateur).
  if (body.action !== "delete" || body.confirm !== "SUPPRIMER") return data({ error: "invalid_request" }, { status: 400, headers: noStore });

  try {
    return data({ ok: true, ...(await deleteMyData(user.osuId)) }, { headers: noStore });
  } catch {
    return data({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}
