import { workoutSourceKindSchema } from "../mobile/personal-workout-contracts";
import type { WorkoutSourceKind } from "../../domain/workout-title";
// Entrenamientos realizados: detalle y lista paginada (RF-34, RF-77). La RLS decide quién ve qué:
// el alumno sus entrenamientos, el coach los de sus alumnos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { setVolume } from "../../domain/volume.ts";
import type { DateString } from "../../domain/dates.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type WorkoutSummary = {
  workingSets: number; // series de trabajo (sin calentamiento)
  volumeKg: number;
  bodyweightReps: number;
  exerciseCount: number;
};

export type WorkoutSetRow = {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
};

export type WorkoutExerciseRow = {
  prescribedExerciseId?: string | null;
  prescribedExerciseName?: string | null;
  position: number;
  exerciseId: string;
  name: string;
  sets: WorkoutSetRow[];
};

export type WorkoutDetail = {
  sourceKind?: WorkoutSourceKind;
  title?: string | null;
  personalRoutineId?: string | null;
  personalRoutineRevision?: number | null;
  id: string;
  studentId: string;
  programId: string | null;
  programName: string | null;
  sessionLabel: string | null;
  startedAt: string;
  durationSeconds: number;
  perceivedEffort: number | null;
  note: string | null;
  performedOn: DateString;
  exercises: WorkoutExerciseRow[];
  summary: WorkoutSummary;
};

type RawSet = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  set_number: number;
  weight_kg: number | string;
  reps: number;
  is_warmup: boolean;
};

function summarize(
  sets: Pick<RawSet, "weight_kg" | "reps" | "is_warmup" | "exercise_id">[],
): WorkoutSummary {
  const { loadKg, bodyweightReps } = setVolume(
    sets.map((s) => ({ weightKg: Number(s.weight_kg), reps: s.reps, isWarmup: s.is_warmup })),
  );
  return {
    workingSets: sets.filter((s) => !s.is_warmup).length,
    volumeKg: loadKg,
    bodyweightReps,
    exerciseCount: new Set(sets.map((s) => s.exercise_id)).size,
  };
}

export async function getWorkoutDetail(
  db: Client,
  id: string,
  ownerId?: string,
): Promise<WorkoutDetail | null> {
  let query = db
    .from("workouts")
    .select(
      `id, student_id, program_id, source_kind, title, personal_routine_id, personal_routine_revision, session_label, started_at, duration_seconds, performed_on, perceived_effort, note,
       programs ( name ),
       workout_sets ( id, exercise_id, exercise_name, prescribed_exercise_id, prescribed_exercise_name, position, set_number, weight_kg, reps, is_warmup )`,
    )
    .eq("id", id);
  if (ownerId) query = query.eq("student_id", ownerId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`No se pudo cargar el entrenamiento: ${error.message}`);
  if (!data) return null;

  const grouped = new Map<number, WorkoutExerciseRow>();
  for (const s of [...data.workout_sets].sort(
    (a, b) => a.position - b.position || a.set_number - b.set_number,
  )) {
    const row = grouped.get(s.position) ?? {
      position: s.position,
      exerciseId: s.exercise_id,
      name: s.exercise_name,
      prescribedExerciseId: s.prescribed_exercise_id,
      prescribedExerciseName: s.prescribed_exercise_name,
      sets: [],
    };
    row.sets.push({
      id: s.id,
      setNumber: s.set_number,
      weightKg: Number(s.weight_kg),
      reps: s.reps,
      isWarmup: s.is_warmup,
    });
    grouped.set(s.position, row);
  }

  return {
    id: data.id,
    studentId: data.student_id,
    sourceKind: workoutSourceKindSchema.parse(data.source_kind),
    title: data.title,
    personalRoutineId: data.personal_routine_id,
    personalRoutineRevision: data.personal_routine_revision,
    programId: data.program_id,
    programName: (data.programs as unknown as { name: string } | null)?.name ?? null,
    sessionLabel: data.session_label,
    startedAt: data.started_at,
    durationSeconds: data.duration_seconds,
    perceivedEffort: data.perceived_effort,
    note: data.note,
    performedOn: data.performed_on as string,
    exercises: [...grouped.values()],
    summary: summarize(data.workout_sets),
  };
}

export type WorkoutListItem = {
  sourceKind?: WorkoutSourceKind;
  title?: string | null;
  id: string;
  perceivedEffort: number | null;
  note: string | null;
  sessionLabel: string | null;
  startedAt: string;
  performedOn: DateString;
  durationSeconds: number;
} & WorkoutSummary;

export async function listWorkouts(
  db: Client,
  studentId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<{ items: WorkoutListItem[]; nextCursor: string | null }> {
  const limit = options.limit ?? 20;
  let query = db
    .from("workouts")
    .select(
      "id, source_kind, title, session_label, started_at, performed_on, duration_seconds, perceived_effort, note, workout_sets(exercise_id, weight_kg, reps, is_warmup)",
    )
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(limit + 1);
  if (options.cursor) query = query.lt("started_at", options.cursor);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);

  const page = data.slice(0, limit);
  return {
    items: page.map((w) => ({
      id: w.id,
      sourceKind: workoutSourceKindSchema.parse(w.source_kind),
      title: w.title,
      sessionLabel: w.session_label,
      startedAt: w.started_at,
      performedOn: w.performed_on as string,
      durationSeconds: w.duration_seconds,
      perceivedEffort: w.perceived_effort,
      note: w.note,
      ...summarize(w.workout_sets),
    })),
    nextCursor: data.length > limit ? page[page.length - 1].started_at : null,
  };
}
