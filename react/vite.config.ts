import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // En dev, expose le fichier .env à `process.env` pour le code serveur
  // (loaders, Better Auth). Vite ne le fait que pour `import.meta.env`.
  // En production (Vercel, etc.) les variables viennent de la plateforme.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
