import type { Config } from "@react-router/dev/config";

export default {
  // Le rendu serveur est indispensable : l'authentification et l'appel à
  // l'API osu! s'exécutent dans les loaders, jamais dans le navigateur.
  ssr: true,
} satisfies Config;
