import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database";
import { trainingHistorySourceSchema } from "../../domain/training-history";
export type TrainingHistoryReadCode = "capacity" | "unauthorized" | "incompatible" | "unavailable";
export class TrainingHistoryReadError extends Error {
  constructor(readonly code: TrainingHistoryReadCode) {
    super(
      code === "capacity"
        ? "El historial supera el límite de esta versión. No se descargó un archivo parcial."
        : code === "unauthorized"
          ? "No autorizado."
          : code === "incompatible"
            ? "El historial requiere una versión compatible de la app. No se descargó un archivo parcial."
            : "No pudimos preparar el historial. Vuelve a intentarlo.",
    );
    this.name = "TrainingHistoryReadError";
  }
}
/** One authenticated STABLE invoker read. Never retry it through a scalar/partial reader. */
export async function readVisibleTrainingHistory(db: SupabaseClient<Database>, studentId: string) {
  const id = z.uuid().safeParse(studentId);
  if (!id.success) return null;
  let response;
  try {
    response = await db.rpc("get_visible_training_history", {
      p_student_id: id.data.toLowerCase(),
    });
  } catch {
    throw new TrainingHistoryReadError("unavailable");
  }
  if (response.error)
    throw new TrainingHistoryReadError(
      response.error.code === "0A000"
        ? "capacity"
        : response.error.code === "42501"
          ? "unauthorized"
          : "unavailable",
    );
  if (response.data === null) return null;
  const parsed = trainingHistorySourceSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.student.id !== id.data.toLowerCase())
    throw new TrainingHistoryReadError("incompatible");
  return parsed.data;
}
