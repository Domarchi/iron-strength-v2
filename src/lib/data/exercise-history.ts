import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { santiagoDate } from "@/domain/dates";
import type { Database } from "@/types/database";

const cursorSchema = z.object({ startedAt: z.iso.datetime({ offset: true }), id: z.uuid() });
export type ExerciseHistoryCursor = z.infer<typeof cursorSchema>;
export type ExerciseHistoryItem = {
  id: string;
  startedAt: string;
  date: string;
  sessionLabel: string | null;
  sets: {
    id: string;
    position: number;
    setNumber: number;
    weightKg: number;
    reps: number;
    isWarmup: boolean;
  }[];
};
export type ExerciseHistoryPage = {
  items: ExerciseHistoryItem[];
  nextCursor: ExerciseHistoryCursor | null;
};

// Diez entrenamientos, no diez series. El ID desempata fechas iguales sin omitir resultados.
export async function listExerciseHistory(
  db: SupabaseClient<Database>,
  studentId: string,
  exerciseId: string,
  options: { cursor?: unknown } = {},
): Promise<ExerciseHistoryPage> {
  const ids = z
    .object({ studentId: z.uuid(), exerciseId: z.uuid() })
    .safeParse({ studentId, exerciseId });
  const cursor = cursorSchema.nullish().safeParse(options.cursor);
  if (!ids.success || !cursor.success) throw new Error("Filtro de historial inválido.");
  let query = db
    .from("workouts")
    .select(
      "id, started_at, performed_on, session_label, workout_sets!inner(id, exercise_id, position, set_number, weight_kg, reps, is_warmup)",
    )
    .eq("student_id", studentId)
    .eq("workout_sets.exercise_id", exerciseId)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(11);
  if (cursor.data) {
    const { startedAt, id } = cursor.data;
    query = query.or(`started_at.lt.${startedAt},and(started_at.eq.${startedAt},id.lt.${id})`);
  }
  const { data, error } = await query;
  if (error) throw new Error("No se pudo cargar el historial del ejercicio.");
  const page = data.slice(0, 10),
    last = page.at(-1);
  return {
    items: page.map((w) => ({
      id: w.id,
      startedAt: w.started_at,
      date: w.performed_on ?? santiagoDate(new Date(w.started_at)),
      sessionLabel: w.session_label,
      sets: w.workout_sets
        .sort((a, b) => a.position - b.position || a.set_number - b.set_number)
        .map((s) => ({
          id: s.id,
          position: s.position,
          setNumber: s.set_number,
          weightKg: Number(s.weight_kg),
          reps: s.reps,
          isWarmup: s.is_warmup,
        })),
    })),
    nextCursor: data.length > 10 && last ? { startedAt: last.started_at, id: last.id } : null,
  };
}
