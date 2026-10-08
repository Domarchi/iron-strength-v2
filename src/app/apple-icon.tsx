import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon-art";

// Icono para "Agregar a pantalla de inicio" en iOS (RF-45). iOS no recorta con máscara: usa el
// dibujo a tamaño completo.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} maskable={false} />, size);
}
