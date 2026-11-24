import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Mêmes URLs que la version HTML/JS.
  route("api/search", "routes/api.search.ts"),
  route("api/assistant", "routes/api.assistant.ts"),
  route("api/lists", "routes/api.lists.ts"),
  route("api/collections", "routes/api.collections.ts"),
  route("api/listen", "routes/api.listen.ts"),
  route("api/similar", "routes/api.similar.ts"),
  route("api/recommendations", "routes/api.recommendations.ts"),
  route("api/analysis", "routes/api.analysis.ts"),
  route("api/progress", "routes/api.progress.ts"),
  route("api/performance", "routes/api.performance.ts"),
  route("api/dna", "routes/api.dna.ts"),
  route("api/profile", "routes/api.profile.ts"),
  route("api/my-data", "routes/api.my-data.ts"),
  route("api/admin/plan", "routes/api.admin.plan.ts"),
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
    route("collection/:id", "routes/collection.$id.tsx"),
    route("history", "routes/history.tsx"),
    route("stats", "routes/stats.tsx"),
    route("dna", "routes/dna.tsx"),
    route("compare", "routes/compare.tsx"),
    route("collections", "routes/collections.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("my-data", "routes/my-data.tsx"),
    route("admin", "routes/admin.tsx"),
    route("premium", "routes/premium.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
