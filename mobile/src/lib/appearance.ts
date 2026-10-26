export type AppearancePreference = "light" | "dark" | "system";
export const APPEARANCE_KEY = "is:native-appearance:v1";
export const palettes = {
  dark: {
    dark: true,
    bg: "#000000",
    card: "#161618",
    raised: "#1c1c1e",
    ink: "#f5f5f7",
    muted: "#aaaab3",
    blue: "#008cff",
    button: "#1266bb",
    border: "#2c2c2e",
    control: "#73737c",
    tint: "#142033",
    success: "#81d9b1",
    completed: "#10250e",
    completedMark: "#287e1b",
    danger: "#ffb4b4",
  },
  light: {
    dark: false,
    bg: "#f7f9fb",
    card: "#ffffff",
    raised: "#f2f4f7",
    ink: "#191a1b",
    muted: "#5b5d65",
    blue: "#1266bb",
    button: "#1266bb",
    border: "#e4e6e9",
    control: "#7b7b85",
    tint: "#eaf0fb",
    success: "#146644",
    completed: "#edf8e9",
    completedMark: "#287e1b",
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
