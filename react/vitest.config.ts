import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/** Tests unitaires (modules purs et logique serveur contre le stockage en mémoire). Lancer : npm test */
export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
