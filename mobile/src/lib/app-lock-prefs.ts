// Bloqueo opcional con huella, rostro o código del teléfono (spec 012, T258). Apagado por defecto.
export const APP_LOCK_KEY = "is:native-applock:v1";
/** Tiempo en segundo plano que se tolera antes de volver a pedir la verificación. */
export const LOCK_GRACE_MS = 60_000;
type Storage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};
export function parseAppLock(raw: string): boolean {
  const value: unknown = JSON.parse(raw);
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "enabled" in value &&
    typeof value.enabled === "boolean"
  )
    return value.enabled;
  throw new Error("Formato de bloqueo desconocido");
}
export async function readAppLock(storage: Storage): Promise<boolean> {
  const raw = await storage.get(APP_LOCK_KEY);
  return raw === null ? false : parseAppLock(raw);
}
export async function saveAppLock(storage: Storage, enabled: boolean) {
  const raw = JSON.stringify({ version: 1, enabled });
  await storage.set(APP_LOCK_KEY, raw);
  if ((await storage.get(APP_LOCK_KEY)) !== raw)
    throw new Error("No se confirmó el bloqueo guardado");
}
/** ¿Hay que volver a pedir verificación al regresar a la app? */
export function shouldLock(input: {
  enabled: boolean;
  backgroundedAtMs: number | null;
  nowMs: number;
  graceMs?: number;
}): boolean {
  if (!input.enabled || input.backgroundedAtMs === null) return false;
  return input.nowMs - input.backgroundedAtMs >= (input.graceMs ?? LOCK_GRACE_MS);
}
