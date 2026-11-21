import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Mêmes URLs que la version HTML/JS.
  route("api/search", "routes/api.search.ts"),
  route("api/assistant", "routes/api.assistant.ts"),
  route("api/lists", "routes/api.lists.ts"),
  route("api/listen", "routes/api.listen.ts"),
  route("api/auth/login", "routes/api.auth.login.ts"),
  route("api/auth/callback", "routes/api.auth.callback.ts"),
  route("api/auth/check", "routes/api.auth.check.ts"),
  // Tous les autres endpoints Better Auth (sign-out, get-session, …).
  route("api/auth/*", "routes/api.auth.$.ts"),

  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("beatmap/:id", "routes/beatmap.$id.tsx"),
    route("player/:id", "routes/player.$id.tsx"),
    route("lists", "routes/lists.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
