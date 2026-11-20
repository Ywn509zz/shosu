import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Mêmes URLs que la version HTML/JS.
  route("api/search", "routes/api.search.ts"),
  route("api/advisor", "routes/api.advisor.ts"),
  route("api/auth/login", "routes/api.auth.login.ts"),
  route("api/auth/callback", "routes/api.auth.callback.ts"),
  route("api/auth/check", "routes/api.auth.check.ts"),
  // Tous les autres endpoints Better Auth (sign-out, get-session, …).
  route("api/auth/*", "routes/api.auth.$.ts"),

  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("advisor", "routes/advisor.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
