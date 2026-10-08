import type { MetadataRoute } from "next";

// App instalable (RF-45, DC-25): se agrega a la pantalla de inicio y abre sin la barra del navegador.
// No hay service worker: instalar no cambia que la app necesita conexión (la sesión en curso se
// protege con el borrador local, RF-22).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iron Strength",
    short_name: "Iron Strength",
    description: "Entrena tus programas, registra tus series y sigue tu progreso.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-CL",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
