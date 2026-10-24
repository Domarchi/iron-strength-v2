// Guardar un entrenamiento terminado (RF-23, RF-24, DC-8). Valida el contenido, comprueba que la
// sesión planificada corresponde a la semana en que se inició el entrenamiento y delega en la
// función SQL save_workout, que es atómica e idempotente por el id que genera el cliente.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export { workoutPayloadSchema } from "../workout/payload";
import { workoutPayloadSchema } from "../workout/payload";

export type SaveWorkoutResult =
  | { ok: true; status: "created" | "duplicate" }
  | {
      ok: false;
      reason:
        | "alternative_unavailable"
        | "invalid"
        | "no_sets"
        | "wrong_week"
        | "not_found"
        | "id_taken"
        | "forbidden";
    };

export async function saveWorkout(args: {
  db: Client;
  payload: unknown;
}): Promise<SaveWorkoutResult> {
  const parsed = workoutPayloadSchema.safeParse(args.payload);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const payload = parsed.data;
  if (payload.sets.length === 0) return { ok: false, reason: "no_sets" };
  if (Date.parse(payload.finishedAt) < Date.parse(payload.startedAt))
    return { ok: false, reason: "invalid" };

  // SQL confirma primero los duplicados propios; después valida rutina/semana y guarda atómicamente.
  const { data, error: rpcError } = await args.db.rpc("save_workout", { p_workout: payload });
  if (rpcError) {
    if (rpcError.code === "P0002")
      return { ok: false, reason: rpcError.details === "wrong_week" ? "wrong_week" : "not_found" };
    if (rpcError.code === "P0001") return { ok: false, reason: "alternative_unavailable" };
    if (rpcError.code === "22023") return { ok: false, reason: "no_sets" };
    if (rpcError.code === "23505") return { ok: false, reason: "id_taken" };
    if (rpcError.code === "42501") return { ok: false, reason: "forbidden" };
    if (["23514", "22P02", "23502", "23503", "22003"].includes(rpcError.code ?? "")) {
      return { ok: false, reason: "invalid" };
    }
    throw new Error(`No se pudo guardar el entrenamiento: ${rpcError.message}`);
  }

  const status = (data as { status?: string } | null)?.status;
  return { ok: true, status: status === "duplicate" ? "duplicate" : "created" };
}
