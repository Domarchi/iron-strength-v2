import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon-art";

// Iconos de la app instalable (RF-45): /icons/192, /icons/512 y /icons/maskable. Se generan al
// compilar; no hay archivos binarios en el repo.
const VARIANTS = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const variant = VARIANTS[size as keyof typeof VARIANTS];
  if (!variant) return new Response(null, { status: 404 });

  return new ImageResponse(<IconArt {...variant} />, { width: variant.size, height: variant.size });
}
