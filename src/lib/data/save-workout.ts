// Guardar un entrenamiento terminado (RF-23, RF-24, DC-8). Valida el contenido, comprueba que la
// sesión planificada corresponde a la semana en que se inició el entrenamiento y delega en la
// función SQL save_workout, que es atómica e idempotente por el id que genera el cliente.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { santiagoDate } from "../../domain/dates.ts";
import { programWeekNumber } from "../../domain/program-weeks.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

const setSchema = z.object({
  sessionExerciseId: z.uuid().optional(),
  prescribedExerciseId: z.uuid().optional(),
  exerciseId: z.uuid(),
  exerciseName: z.string().min(1).max(100),
  position: z.number().int().min(0).max(100),
  setNumber: z.number().int().min(1).max(100),
  weightKg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(100),
  isWarmup: z.boolean(),
});

export const workoutPayloadSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  programSessionId: z.uuid(),
  sessionLabel: z.string().min(1).max(10),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  durationSeconds: z.number().int().min(0).max(86_400),
  sets: z.array(setSchema).max(300),
});

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

  // La sesión planificada debe ser del programa del propio alumno (la RLS oculta las ajenas) y su
  // semana debe ser la semana (en Santiago) en que se inició el entrenamiento.
  const { data: session, error } = await args.db
    .from("program_sessions")
    .select("week_number, program_id, programs(start_date, ends_on, weeks_count, student_id)")
    .eq("id", payload.programSessionId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la sesión: ${error.message}`);

  const program = session?.programs as unknown as {
    start_date: string | null;
    ends_on: string | null;
    weeks_count: number;
  } | null;
  if (
    !session ||
    !program?.start_date ||
    !program.ends_on ||
    session.program_id !== payload.programId
  ) {
    return { ok: false, reason: "not_found" };
  }

  const startedWeek = programWeekNumber(
    { startDate: program.start_date, endsOn: program.ends_on, weeksCount: program.weeks_count },
    santiagoDate(new Date(payload.startedAt)),
  );
  if (startedWeek !== session.week_number) return { ok: false, reason: "wrong_week" };

  const { data, error: rpcError } = await args.db.rpc("save_workout", { p_workout: payload });
  if (rpcError) {
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
