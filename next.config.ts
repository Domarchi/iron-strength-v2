import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas las pantallas son por usuario (RLS) y dinámicas: no se usan Cache Components.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Cabeceras de seguridad para todas las rutas (T102). Sin CSP de scripts: Next inyecta scripts en
  // línea y exigiría nonces; las protecciones de abajo no dependen de eso.
  async headers() {
    return [
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
