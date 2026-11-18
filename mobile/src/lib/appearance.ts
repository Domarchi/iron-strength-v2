export type AppearancePreference = "light" | "dark" | "system";
export const APPEARANCE_KEY = "is:native-appearance:v1";
// Paleta Forja (spec 012, T237). Las claves se conservan para no tocar las 80 pantallas actuales:
// `blue` es el acento (texto/enlace) y `button` el relleno de la acción primaria.
export const palettes = {
  dark: {
    dark: true,
    bg: "#0c0c0b",
    card: "#171716",
    raised: "#222220",
    field: "#222220",
    ink: "#f4f1ea",
    muted: "#9b968b",
    blue: "#ff5a1f",
    button: "#ff5a1f",
    onButton: "#120a05",
    border: "#2c2b28",
    control: "#85816f",
    tint: "#3a1a0c",
    success: "#86d99a",
    completed: "#16261b",
    completedMark: "#86d99a",
    danger: "#ff6b6b",
  },
  light: {
    dark: false,
    bg: "#f6f3ec",
    card: "#ffffff",
    raised: "#eeeae0",
    field: "#eeeae0",
    ink: "#15130f",
    muted: "#6d675a",
    blue: "#bf3606",
    button: "#bf3606",
    onButton: "#ffffff",
    border: "#ddd8cb",
    control: "#7d7565",
    tint: "#fff1ea",
    success: "#17692f",
    completed: "#e3f2e6",
    completedMark: "#17692f",
    danger: "#c4281c",
  },
};
export type Palette = (typeof palettes)["light"];
export function resolveAppearance(
  preference: AppearancePreference,
  system: string | null | undefined,
) {
  return preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
}
type PreferenceStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};
export async function readAppearance(storage: PreferenceStorage): Promise<AppearancePreference> {
  const raw = await storage.get(APPEARANCE_KEY);
  if (raw === null) return "system";
  const value: unknown = JSON.parse(raw);
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "preference" in value &&
    (value.preference === "light" || value.preference === "dark" || value.preference === "system")
  )
    return value.preference;
  throw new Error("Formato de apariencia desconocido");
}
export async function saveAppearance(storage: PreferenceStorage, preference: AppearancePreference) {
  const raw = JSON.stringify({ version: 1, preference });
  await storage.set(APPEARANCE_KEY, raw);
  if ((await storage.get(APPEARANCE_KEY)) !== raw)
    throw new Error("No se confirmó el tema guardado");
}
