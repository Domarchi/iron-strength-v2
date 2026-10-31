export type AppearancePreference = "light" | "dark" | "system";
export const APPEARANCE_KEY = "is:native-appearance:v1";
export const palettes = {
  dark: {
    dark: true,
    bg: "#0b0c0e",
    card: "#16181c",
    raised: "#202329",
    field: "#181b20",
    ink: "#f3f4f6",
    muted: "#a2a8b3",
    blue: "#98beff",
    button: "#245fdb",
    border: "#2c3037",
    control: "#747d8c",
    tint: "#13233e",
    success: "#a0e4bf",
    completed: "#183829",
    completedMark: "#a0e4bf",
    danger: "#ffb4b4",
  },
  light: {
    dark: false,
    bg: "#fafafa",
    card: "#ffffff",
    raised: "#eceef1",
    field: "#f4f5f7",
    ink: "#171a20",
    muted: "#565e6a",
    blue: "#2058bd",
    button: "#2058bd",
    border: "#dfe2e7",
    control: "#808691",
    tint: "#eaf0fc",
    success: "#1d6742",
    completed: "#e5f3eb",
    completedMark: "#1d6742",
    danger: "#b32626",
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
