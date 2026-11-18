// Preferencias de avisos del dispositivo (spec 012, T251). Todo es opcional y está apagado por defecto.
export const ALERTS_KEY = "is:native-alerts:v1";
export type AlertsPrefs = {
  /** Aviso al terminar el descanso cuando la app no está en primer plano. */
  restEnd: boolean;
  /** Recordatorio diario para entrenar a la hora elegida. */
  reminder: { enabled: boolean; hour: number; minute: number };
};
export const defaultAlerts: AlertsPrefs = {
  restEnd: false,
  reminder: { enabled: false, hour: 18, minute: 0 },
};
type Storage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function parseAlerts(raw: string): AlertsPrefs {
  const value: unknown = JSON.parse(raw);
  if (typeof value === "object" && value !== null && "version" in value && value.version === 1) {
    const v = value as {
      restEnd?: unknown;
      reminder?: { enabled?: unknown; hour?: unknown; minute?: unknown };
    };
    if (
      typeof v.restEnd === "boolean" &&
      v.reminder &&
      typeof v.reminder.enabled === "boolean" &&
      int(v.reminder.hour, 0, 23) &&
      int(v.reminder.minute, 0, 59)
    )
      return {
        restEnd: v.restEnd,
        reminder: { enabled: v.reminder.enabled, hour: v.reminder.hour, minute: v.reminder.minute },
      };
  }
  throw new Error("Formato de avisos desconocido");
}
export async function readAlerts(storage: Storage): Promise<AlertsPrefs> {
  const raw = await storage.get(ALERTS_KEY);
  return raw === null ? defaultAlerts : parseAlerts(raw);
}
/** Escribe y relee: no se anuncia un ajuste que no quedó guardado. */
export async function saveAlerts(storage: Storage, prefs: AlertsPrefs) {
  const raw = JSON.stringify({ version: 1, ...prefs });
  await storage.set(ALERTS_KEY, raw);
  if ((await storage.get(ALERTS_KEY)) !== raw) throw new Error("No se confirmó el aviso guardado");
}
/** Segundos hasta el aviso de descanso; nunca programa uno ya vencido ni absurdo. */
export function restAlertDelay(remainingSeconds: number): number | null {
  return Number.isFinite(remainingSeconds) && remainingSeconds >= 3 && remainingSeconds <= 3600
    ? Math.round(remainingSeconds)
    : null;
}
export const formatTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
