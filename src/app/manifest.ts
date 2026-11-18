import type { MetadataRoute } from "next";

// App instalable (RF-45, DC-25): se agrega a la pantalla de inicio y abre sin la barra del navegador.
// La descarga explícita prepara una pantalla local y recursos públicos para abrir sin conexión.
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
    background_color: "#0c0c0b",
    theme_color: "#0c0c0b",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
