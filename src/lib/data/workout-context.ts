// Contexto de una sesión a entrenar (RF-19, RF-20, RF-15b, DC-9): ejercicios en orden con su
// prescripción, "última vez", peso previo para precargar y la sugerencia de progresión.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, mondayOf, santiagoDate, type DateString } from "../../domain/dates.ts";
import { lastByExercise, type HistoryWorkout, type LastPerformance } from "../../domain/history.ts";
import { programWeekNumber } from "../../domain/program-weeks.ts";
import { suggestProgression, type Suggestion } from "../../domain/progression.ts";
import type { Database } from "../../types/database.ts";
import type { PrefillExercise } from "../workout/runner-state.ts";

type Client = SupabaseClient<Database>;

export type ContextExercise = PrefillExercise & {
  muscleGroup?: string;
  equipment?: string | null;
  note: string | null;
  last: Pick<LastPerformance, "date" | "sets"> | null;
  suggestion: Suggestion | null;
};

export type WorkoutContext = {
  session: {
    id: string;
    label: string;
    programId: string;
    programName: string;
    weekNumber: number;
    weeksCount: number;
  };
  exercises: ContextExercise[];
};

export type WorkoutContextResult =
  | { ok: true; context: WorkoutContext; canStart: boolean }
  | { ok: false; reason: "not_found" | "not_current_week" };

// Cuántos entrenamientos recientes se revisan para encontrar la "última vez" de cada ejercicio.
const HISTORY_WINDOW = 60;

export async function getWorkoutContext(
  db: Client,
  studentId: string,
  plannedSessionId: string,
  today: DateString = santiagoDate(new Date()),
  allowRecovery = false,
): Promise<WorkoutContextResult> {
  const { data: session, error } = await db
    .from("program_sessions")
    .select(
      `id, week_number, label, program_id,
       programs ( name, start_date, ends_on, weeks_count, student_id ),
       session_exercises (
         id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note,
         exercises ( name, muscle_group, equipment, is_bodyweight, progression_increment_kg )
       )`,
    )
    .eq("id", plannedSessionId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la sesión: ${error.message}`);

  const program = session?.programs as unknown as {
    name: string;
    start_date: string | null;
    ends_on: string | null;
    weeks_count: number;
    student_id: string | null;
  } | null;
  if (!session || !program?.start_date || !program.ends_on || program.student_id !== studentId) {
    return { ok: false, reason: "not_found" };
  }

  const currentWeek = programWeekNumber(
    { startDate: program.start_date, endsOn: program.ends_on, weeksCount: program.weeks_count },
    today,
  );
  const canStart = currentWeek === session.week_number;
  const sessionWeekStart = addDays(program.start_date, (session.week_number - 1) * 7);
  // Solo se abre una semana pasada para recuperar un borrador. Una semana futura sigue cerrada.
  if (!canStart && !(allowRecovery && sessionWeekStart < mondayOf(today))) {
    return { ok: false, reason: "not_current_week" };
  }

  const { data: recent, error: historyError } = await db
    .from("workouts")
    .select("id, started_at, workout_sets(exercise_id, weight_kg, reps, is_warmup)")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(HISTORY_WINDOW);
  if (historyError) throw new Error(`No se pudo cargar el historial: ${historyError.message}`);

  const history: HistoryWorkout[] = recent.map((w) => ({
    id: w.id,
    startedAt: w.started_at,
    sets: w.workout_sets.map((s) => ({
      exerciseId: s.exercise_id,
      weightKg: Number(s.weight_kg),
      reps: s.reps,
      isWarmup: s.is_warmup,
    })),
  }));
  const lastBy = lastByExercise(history);

  const exercises: ContextExercise[] = [...session.session_exercises]
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const exercise = row.exercises as unknown as {
        name: string;
        muscle_group: string;
        equipment: string | null;
        is_bodyweight: boolean;
        progression_increment_kg: number;
      };
      const prescribed = {
        sets: row.sets,
        repsMin: row.reps_min,
        repsMax: row.reps_max,
        targetWeightKg: row.target_weight_kg === null ? null : Number(row.target_weight_kg),
      };
      const last = lastBy.get(row.exercise_id) ?? null;
      return {
        sessionExerciseId: row.id,
        exerciseId: row.exercise_id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        equipment: exercise.equipment,
        isBodyweight: exercise.is_bodyweight,
        prescribed,
        note: row.note,
        lastWeightKg: last && last.topWeightKg > 0 ? last.topWeightKg : null,
        last: last ? { date: last.date, sets: last.sets } : null,
        suggestion: last
          ? suggestProgression({
              prescription: prescribed,
              lastSets: last.sets,
              incrementKg: Number(exercise.progression_increment_kg),
              isBodyweight: exercise.is_bodyweight,
            })
          : null,
      };
    });

  return {
    ok: true,
    canStart,
    context: {
      session: {
        id: session.id,
        label: session.label,
        programId: session.program_id,
        programName: program.name,
        weekNumber: session.week_number,
        weeksCount: program.weeks_count,
      },
      exercises,
    },
  };
}
