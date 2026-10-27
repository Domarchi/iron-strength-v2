import { repetitionValues } from "./stored-training-set";
// Resumen semanal del alumno (RF-32; DC-16, DC-29): la semana anterior completa y la semana en curso
// (parcial), cada una con sus cumplidas, entrenamientos, récords, volumen y variación frente a la
// semana previa. Se calcula al abrirlo con las reglas del dominio; la RLS limita todo al alumno
// (o a su coach).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, mondayOf, type DateString } from "../../domain/dates.ts";
import {
  countRecordsPerWorkout,
  summarizeWeek,
  type SummaryWorkout,
  type WeekAggregate,
} from "../../domain/weekly-summary.ts";
import { trendVsPrevious } from "../../domain/volume.ts";
import type { Database } from "../../types/database.ts";
import { getWeekView } from "./week";

type Client = SupabaseClient<Database>;

export type WeekCard = WeekAggregate & {
  isCurrent: boolean;
  // null: esa semana no tenía programa en curso (o era una semana de descarga).
  sessions: { planned: number; done: number } | null;
  // Fracción de cambio del volumen frente a la semana anterior; null si no hay con qué comparar.
  volumeTrend: number | null;
};

export type WeeklySummary = { previous: WeekCard; current: WeekCard };

// Tope de entrenamientos revisados para detectar récords (el límite de filas de la API es 1000).
const MAX_WORKOUTS = 1000;

async function fetchWorkouts(db: Client, studentId: string): Promise<SummaryWorkout[]> {
  const { data, error } = await db
    .from("workouts")
    .select(
      "id, started_at, performed_on, workout_sets(exercise_id, weight_kg, reps, is_warmup, record_type)",
    )
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(MAX_WORKOUTS);
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);

  return data.map((w) => ({
    id: w.id,
    startedAt: w.started_at,
    performedOn: w.performed_on as string,
    sets: w.workout_sets.map((s) => ({
      exerciseId: s.exercise_id,
      ...repetitionValues(s),
      isWarmup: s.is_warmup,
    })),
  }));
}

async function sessionsOf(
  db: Client,
  studentId: string,
  dayInWeek: DateString,
): Promise<WeekCard["sessions"]> {
  const view = await getWeekView(db, studentId, dayInWeek);
  if (view.kind !== "active" || view.compliance.deload) return null;
  return { planned: view.compliance.planned, done: view.compliance.done };
}

export async function getWeeklySummary(
  db: Client,
  studentId: string,
  today: DateString,
): Promise<WeeklySummary> {
  const currentStart = mondayOf(today);
  const previousStart = addDays(currentStart, -7);
  const beforeStart = addDays(currentStart, -14);

  const [workouts, currentSessions, previousSessions] = await Promise.all([
    fetchWorkouts(db, studentId),
    sessionsOf(db, studentId, today),
    sessionsOf(db, studentId, addDays(currentStart, -1)),
  ]);

  const records = countRecordsPerWorkout(workouts);
  const before = summarizeWeek(beforeStart, workouts, records);
  const previous = summarizeWeek(previousStart, workouts, records);
  const current = summarizeWeek(currentStart, workouts, records);

  return {
    previous: {
      ...previous,
      isCurrent: false,
      sessions: previousSessions,
      volumeTrend: trendVsPrevious(previous.volumeKg, before.volumeKg),
    },
    current: {
      ...current,
      isCurrent: true,
      sessions: currentSessions,
      volumeTrend: trendVsPrevious(current.volumeKg, previous.volumeKg),
    },
  };
}
