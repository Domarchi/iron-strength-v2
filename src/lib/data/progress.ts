// Progreso por ejercicio, series para los gráficos y récords de un entrenamiento (RF-28, RF-30,
// DC-6, DC-7). Trae las series con paginación y calcula con el dominio puro (`src/domain`).
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import {
  bestMarks,
  detectRecords,
  type RecordEvent,
  type SetRecord,
} from "../../domain/records.ts";
import { exerciseProgressSeries, type ProgressPoint } from "../../domain/volume.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type StudentSet = {
  id: string;
  workoutId: string;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  startedAt: string;
};

// PostgREST devuelve como máximo 1000 filas por petición: se pide por páginas.
export async function fetchStudentSets(
  db: Client,
  studentId: string,
  options: { exerciseIds?: string[]; before?: string; pageSize?: number } = {},
): Promise<StudentSet[]> {
  const pageSize = options.pageSize ?? 1000;
  const rows: StudentSet[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = db
      .from("workout_sets")
      .select(
        "id, workout_id, exercise_id, exercise_name, weight_kg, reps, is_warmup, workouts!inner(started_at)",
      )
      .eq("student_id", studentId)
      .order("id")
      .range(from, from + pageSize - 1);
    if (options.exerciseIds) query = query.in("exercise_id", options.exerciseIds);
    if (options.before) query = query.lt("workouts.started_at", options.before);

    const { data, error } = await query;
    if (error) throw new Error(`No se pudieron cargar las series: ${error.message}`);

    for (const r of data) {
      rows.push({
        id: r.id,
        workoutId: r.workout_id,
        exerciseId: r.exercise_id,
        name: r.exercise_name,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        isWarmup: r.is_warmup,
        startedAt: (r.workouts as unknown as { started_at: string }).started_at,
      });
    }
    if (data.length < pageSize) break;
  }
  return rows;
}

export type ExerciseProgress = {
  exerciseId: string;
  name: string;
  bestWeightKg: number;
  bestEstimated1RM: number;
  bestReps: number; // mejor serie en repeticiones (útil en peso corporal)
  isBodyweight: boolean;
  lastDate: DateString;
  workoutCount: number;
};

export async function listExerciseProgress(
  db: Client,
  studentId: string,
): Promise<ExerciseProgress[]> {
  const sets = (await fetchStudentSets(db, studentId)).filter((s) => !s.isWarmup);
  const byExercise = new Map<string, StudentSet[]>();
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);

  const list: ExerciseProgress[] = [];
  for (const [exerciseId, rows] of byExercise) {
    const newest = rows.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
    const marks = bestMarks(rows.map(toRecord)).get(exerciseId);
    list.push({
      exerciseId,
      name: newest.name,
      bestWeightKg: marks?.weightKg ?? 0,
      bestEstimated1RM: marks?.estimated1RM ?? 0,
      bestReps: Math.max(...rows.map((r) => r.reps)),
      isBodyweight: rows.every((r) => r.weightKg === 0),
      lastDate: santiagoDate(new Date(newest.startedAt)),
      workoutCount: new Set(rows.map((r) => r.workoutId)).size,
    });
  }
  return list.sort(
    (a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, "es"),
  );
}

const toRecord = (s: StudentSet): SetRecord => ({
  exerciseId: s.exerciseId,
  weightKg: s.weightKg,
  reps: s.reps,
  isWarmup: s.isWarmup,
});

// Un punto por entrenamiento (mejor 1RM estimado y volumen) para el gráfico de un ejercicio.
export async function getExerciseSeries(
  db: Client,
  studentId: string,
  exerciseId: string,
): Promise<ProgressPoint[]> {
  const sets = await fetchStudentSets(db, studentId, { exerciseIds: [exerciseId] });
  const byWorkout = new Map<string, StudentSet[]>();
  for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s]);

  return exerciseProgressSeries(
    [...byWorkout].map(([workoutId, rows]) => ({
      workoutId,
      date: santiagoDate(new Date(rows[0].startedAt)),
      sets: rows.map((r) => ({ weightKg: r.weightKg, reps: r.reps, isWarmup: r.isWarmup })),
    })),
  );
}

export type WorkoutRecord = RecordEvent & { name: string };

// Récords que logró un entrenamiento frente a todo lo anterior (el primer registro no cuenta).
export async function getWorkoutRecords(db: Client, workoutId: string): Promise<WorkoutRecord[]> {
  const { data: workout, error } = await db
    .from("workouts")
    .select(
      "student_id, started_at, workout_sets(exercise_id, exercise_name, weight_kg, reps, is_warmup)",
    )
    .eq("id", workoutId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el entrenamiento: ${error.message}`);
  if (!workout || workout.workout_sets.length === 0) return [];

  const current: SetRecord[] = workout.workout_sets.map((s) => ({
    exerciseId: s.exercise_id,
    weightKg: Number(s.weight_kg),
    reps: s.reps,
    isWarmup: s.is_warmup,
  }));
  const names = new Map(workout.workout_sets.map((s) => [s.exercise_id, s.exercise_name]));

  const history = await fetchStudentSets(db, workout.student_id, {
    exerciseIds: [...names.keys()],
    before: workout.started_at,
  });

  return detectRecords(history.map(toRecord), current).map((event) => ({
    ...event,
    name: names.get(event.exerciseId) ?? "Ejercicio",
  }));
}
