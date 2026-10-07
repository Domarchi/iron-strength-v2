import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas las pantallas son por usuario (RLS) y dinámicas: no se usan Cache Components.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
