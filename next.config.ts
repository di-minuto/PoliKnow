import type { NextConfig } from "next";

// Todas las páginas de la app dependen de la sesión del usuario, así que se
// renderizan bajo demanda; no se activa Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
