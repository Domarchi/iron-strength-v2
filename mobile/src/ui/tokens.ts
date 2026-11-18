// Sistema de diseño v2 · dirección A «Forja» (T237). Fuente única de tokens visuales.
// Los pares de color se verifican con contraste AA en tokens.test.ts.

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  ok: string;
  okBg: string;
  rec: string;
  recBg: string;
  danger: string;
  dangerBg: string;
  scrim: string;
};

export const themes: { dark: Theme; light: Theme } = {
  dark: {
    dark: true,
    bg: "#0C0C0B",
    surface: "#171716",
    surface2: "#222220",
    line: "#2C2B28",
    text: "#F4F1EA",
    muted: "#9B968B",
    accent: "#FF5A1F",
    accentSoft: "#3A1A0C",
    onAccent: "#120A05",
    ok: "#86D99A",
    okBg: "#16261B",
    rec: "#FFC247",
    recBg: "#2A220F",
    danger: "#FF6B6B",
    dangerBg: "#2C1514",
    scrim: "rgba(0,0,0,0.6)",
  },
  light: {
    dark: false,
    bg: "#F6F3EC",
    surface: "#FFFFFF",
    surface2: "#EEEAE0",
    line: "#DDD8CB",
    text: "#15130F",
    muted: "#6D675A",
    // El #E8480F de la propuesta no alcanza AA con texto blanco (3,9:1); se usa un naranja más profundo.
    accent: "#BF3606",
    accentSoft: "#FFF1EA",
    onAccent: "#FFFFFF",
    ok: "#17692F",
    okBg: "#E3F2E6",
    rec: "#8A5A00",
    recBg: "#FBEFCF",
    danger: "#C4281C",
    dangerBg: "#FBE4E1",
    scrim: "rgba(20,19,15,0.45)",
  },
};

/** Familias cargadas por expo-font (ver fonts.ts). */
export const fonts = {
  display: "BarlowCondensed_800ExtraBold",
  displayMedium: "BarlowCondensed_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const touch = 44;
/** Duraciones de movimiento (ms). Con «Reducir movimiento» todas valen 0. */
export const motion = { fast: 120, base: 220, slow: 360 } as const;

export type TextVariant = "display" | "title" | "heading" | "body" | "caption" | "label" | "number";
/** Escala tipográfica de seis niveles más cifras. `numberSize` se usa con `size`. */
export const typeScale: Record<
  TextVariant,
  { family: keyof typeof fonts; size: number; line: number; track?: number; upper?: boolean }
> = {
  display: { family: "display", size: 44, line: 46, track: 0.4, upper: true },
  title: { family: "display", size: 32, line: 34, track: 0.4, upper: true },
  heading: { family: "displayMedium", size: 22, line: 26, track: 0.3, upper: true },
  body: { family: "body", size: 15, line: 22 },
  caption: { family: "body", size: 13, line: 18 },
  label: { family: "bodySemi", size: 11, line: 14, track: 1.1, upper: true },
  number: { family: "display", size: 32, line: 34 },
};

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Relación de contraste WCAG entre dos colores #RRGGBB. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
