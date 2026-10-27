import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  trainingMetricsSchema,
  trainingRecordedSetSchema,
  trainingTotals,
} from "../../domain/training-metrics";
import {
  typedRecordingPayloadSchema,
  typedRecordingReceiptSchema,
  typedWorkoutStructureSchema,
  typedWorkoutSchema,
  trainingExerciseNotesSchema,
  type TypedRecordingPayload,
} from "../mobile/typed-recording-contracts";
type Client = SupabaseClient<Database>;
export async function saveTypedWorkoutRecording(db: Client, value: TypedRecordingPayload) {
  const input = typedRecordingPayloadSchema.parse(value);
  const result = await db.rpc("save_typed_workout_recording", { p_recording: input as Json });
  if (result.error) throw result.error;
  const receipt = typedRecordingReceiptSchema.parse(result.data);
  if (receipt.workoutId !== input.id) throw Error("No se confirmó este entrenamiento.");
  return receipt;
}
export async function getTypedWorkoutDetail(db: Client, id: string, ownerId?: string) {
  let query = db
    .from("workouts")
    .select(
      `id,student_id,source_kind,title,personal_routine_id,personal_routine_revision,session_label,started_at,performed_on,duration_seconds,perceived_effort,note,structure,exercise_notes,programs(name),
    workout_sets(id,exercise_id,exercise_name,prescribed_exercise_name,position,set_number,record_type,weight_kg,reps,duration_seconds,distance_meters,set_type,effort)`,
    )
    .eq("id", id);
  if (ownerId) query = query.eq("student_id", ownerId);
  const result = await query.maybeSingle();
  if (result.error) throw Error("No pudimos cargar el entrenamiento.");
  const w = result.data;
  if (
    !w ||
    !w.structure ||
    typeof w.structure !== "object" ||
    Array.isArray(w.structure) ||
    w.structure.version !== 2
  )
    return null;
  const structure = typedWorkoutStructureSchema.parse(w.structure);
  const metadata = await db
    .from("exercises")
    .select("id,name")
    .in("id", [
      ...new Set(
        structure.exercises.flatMap((r) => [
          r.exerciseId,
          ...(r.prescribedExerciseId ? [r.prescribedExerciseId] : []),
        ]),
      ),
    ]);
  if (metadata.error) throw Error("No pudimos cargar los ejercicios del entrenamiento.");
  const names = new Map(metadata.data.map((e) => [e.id, e.name]));
  const notes = trainingExerciseNotesSchema.parse(w.exercise_notes);
  const exercises = structure.exercises.map((row, position) => {
    const performed = w.workout_sets
      .filter((s) => s.position === position)
      .sort((a, b) => a.set_number - b.set_number);
    return {
      ...row,
      position,
      name: performed[0]?.exercise_name ?? names.get(row.exerciseId) ?? "Ejercicio no disponible",
      prescribedExerciseName:
        performed[0]?.prescribed_exercise_name ??
        (row.prescribedExerciseId ? (names.get(row.prescribedExerciseId) ?? null) : null),
      athleteNote: notes.find((n) => n.sessionExerciseId === row.id)?.note ?? null,
      sets: performed.map((s) => ({
        id: s.id,
        setNumber: s.set_number,
        metrics: trainingMetricsSchema.parse({
          recordType: s.record_type,
          weightKg: s.weight_kg,
          reps: s.reps,
          durationSeconds: s.duration_seconds,
          distanceMeters: s.distance_meters,
        }),
        setType: s.set_type,
        effort: s.effort,
      })),
    };
  });
  const totals = trainingTotals(
    exercises.flatMap((e) =>
      e.sets.map((s) =>
        trainingRecordedSetSchema.parse({ ...s.metrics, setType: s.setType, effort: s.effort }),
      ),
    ),
  );
  return typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: w.id,
      sourceKind: w.source_kind,
      title: w.title,
      personalRoutineId: w.personal_routine_id,
      personalRoutineRevision: w.personal_routine_revision,
      programName: w.programs?.name ?? null,
      sessionLabel: w.session_label,
      startedAt: w.started_at,
      performedOn: w.performed_on,
      durationSeconds: w.duration_seconds,
      perceivedEffort: w.perceived_effort,
      note: w.note,
      structure,
      exercises,
      summary: {
        workingSets: totals.workingSets,
        volumeKg: totals.externalVolumeKg,
        bodyweightReps: totals.bodyweightReps,
        exerciseCount: exercises.filter((e) => e.sets.length > 0).length,
        recordedSeconds: totals.durationSeconds,
        distanceMeters: totals.distanceMeters,
      },
    },
  });
}
