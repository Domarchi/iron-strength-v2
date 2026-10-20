import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const buildFile = path.join(distDir, "BUILD_ID");
const offlineBuildId =
  process.env.IRON_BUILD_ID ??
  (existsSync(buildFile)
    ? readFileSync(buildFile, "utf8").trim()
    : randomUUID().replaceAll("-", ""));
const nextConfig: NextConfig = {
  distDir,
  generateBuildId: async () => offlineBuildId,
  env: { NEXT_PUBLIC_OFFLINE_BUILD_ID: offlineBuildId },
  // Todas las pantallas son por usuario (RLS) y dinámicas: no se usan Cache Components.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Cabeceras de seguridad para todas las rutas (T102). Sin CSP de scripts: Next inyecta scripts en
  // línea y exigiría nonces; las protecciones de abajo no dependen de eso.
  async headers() {
    return [
      {
        source: "/offline-workers/:path*",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // La cámara se permite solo a la propia app (fotos de progreso); el resto, nada.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
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
