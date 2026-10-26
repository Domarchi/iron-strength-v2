import { workoutSourceKindSchema } from "../mobile/personal-workout-contracts";
// Historial listo para exportar a CSV (RF-47). La RLS decide quién puede ver al alumno: el propio
// alumno y su coach. Para cualquier otro, el alumno "no existe" (no se revela que existe).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportSet } from "../../domain/csv.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type HistoryExport =
  { ok: true; studentName: string; rows: ExportSet[] } | { ok: false; reason: "not_found" };

// Tope de entrenamientos por exportación (el límite de filas de la API es 1000).
const MAX_WORKOUTS = 1000;

export async function getHistoryExport(db: Client, studentId: string): Promise<HistoryExport> {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("full_name, role")
    .eq("id", studentId)
    .maybeSingle();
  if (profileError) throw new Error(`No se pudo cargar al alumno: ${profileError.message}`);
  if (!profile) return { ok: false, reason: "not_found" };

  const { data, error } = await db
    .from("workouts")
    .select(
      `started_at, performed_on, source_kind, title, session_label, perceived_effort, note,
       workout_sets ( prescribed_exercise_name, exercise_name, position, set_number, weight_kg, reps, is_warmup )`,
    )
    .eq("student_id", studentId)
    .order("started_at", { ascending: true })
    .limit(MAX_WORKOUTS);
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);

  const rows: ExportSet[] = data.flatMap((workout) =>
    [...workout.workout_sets]
      .sort((a, b) => a.position - b.position || a.set_number - b.set_number)
      .map((set) => ({
        date: workout.performed_on as string,
        sourceKind: workoutSourceKindSchema.parse(workout.source_kind),
        workoutTitle: workout.title,
        perceivedEffort: workout.perceived_effort,
        workoutNote: workout.note,
        sessionLabel: workout.session_label,
        exerciseName: set.exercise_name,
        prescribedExerciseName: set.prescribed_exercise_name,
        setNumber: set.set_number,
        isWarmup: set.is_warmup,
        weightKg: Number(set.weight_kg),
        reps: set.reps,
      })),
  );

  return { ok: true, studentName: profile.full_name, rows };
}
