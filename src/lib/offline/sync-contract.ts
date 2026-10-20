import { z } from "zod";
import { ACHIEVEMENT_KINDS } from "@/domain/achievements";
export const SYNC_REASONS = [
  "invalid",
  "no_sets",
  "wrong_week",
  "not_found",
  "id_taken",
  "alternative_unavailable",
  "forbidden",
  "session_expired",
  "account_changed",
  "network",
] as const;
export const syncResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    status: z.enum(["created", "duplicate"]),
    achievements: z.array(z.enum(ACHIEVEMENT_KINDS)).optional(),
  }),
  z.object({ ok: z.literal(false), reason: z.enum(SYNC_REASONS) }),
]);
export type SyncResult = z.infer<typeof syncResponseSchema>;
export const SYNC_MESSAGES: Record<(typeof SYNC_REASONS)[number], string> = {
  invalid: "Hay datos inválidos en el entrenamiento. Conservamos el registro para revisarlo.",
  no_sets: "No completaste ninguna serie.",
  wrong_week:
    "La fecha de inicio ya no corresponde a la semana de la rutina. Conservamos tu registro en este dispositivo.",
  not_found:
    "La rutina ya no está disponible. Conservamos tu registro en este dispositivo para revisarlo con tu coach.",
  id_taken: "No se pudo confirmar el identificador del entrenamiento. Conservamos tu registro.",
  alternative_unavailable:
    "La rutina cambió o el ejercicio elegido ya no está autorizado. Conservamos tu registro en este dispositivo para revisarlo.",
  forbidden: "Tu cuenta no tiene permiso para guardar este entrenamiento. Conservamos tu registro.",
  session_expired:
    "Tu sesión expiró. Vuelve a entrar con la misma cuenta para sincronizar; el registro se conserva.",
  account_changed:
    "La cuenta cambió. Entra con la cuenta que realizó el entrenamiento para sincronizarlo.",
  network:
    "No hay conexión con el servidor. El entrenamiento seguirá pendiente hasta que puedas sincronizarlo.",
};
