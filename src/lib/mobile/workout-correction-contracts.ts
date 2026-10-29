import { z } from "zod";
import { santiagoDate } from "../../domain/dates";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingSetDetailsSchema,
} from "../../domain/training-metrics";
import { workoutSourceKindSchema } from "./personal-workout-contracts";
import { workoutStructureSchema } from "./recording-contracts";
import {
  trainingExerciseNotesSchema,
  typedWorkoutStructureSchema,
} from "./typed-recording-contracts";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(0).max(2147483647);
const editableSet = z
  .object({
    id: uuid,
    metrics: trainingMetricsSchema,
    setType: trainingSetDetailsSchema.shape.setType.nullable(),
    effort: trainingSetDetailsSchema.shape.effort,
    isWarmup: z.boolean(),
  })
  .strict()
  .refine((s) => s.setType === null || s.isWarmup === (s.setType === "warmup"));
const recordedSet = editableSet.extend({
  position: z.number().int().min(0).max(14),
  setNumber: z.number().int().min(1).max(20),
  exerciseId: uuid,
  exerciseName: z.string().min(1).max(100),
  prescribedExerciseId: uuid.nullable(),
  prescribedExerciseName: z.string().nullable(),
  sessionExerciseId: uuid.nullable(),
});
const header = {
  perceivedEffort: z.number().int().min(1).max(10).nullable(),
  note: athleteNoteSchema,
  exerciseNotes: trainingExerciseNotesSchema.nullable(),
};
export const workoutCorrectionSchema = z
  .object({
    version: z.literal(1),
    requestId: uuid,
    workoutId: uuid,
    expectedRevision: revision,
    ...header,
    sets: z.array(editableSet).min(1).max(300),
  })
  .strict()
  .refine((v) => new Set(v.sets.map((s) => s.id)).size === v.sets.length);
export type WorkoutCorrection = z.infer<typeof workoutCorrectionSchema>;

export const workoutCorrectionSnapshotSchema = z
  .object({
    version: z.literal(1),
    userId: uuid,
    today: z.iso.date(),
    workout: z
      .object({
        id: uuid,
        revision,
        sourceKind: workoutSourceKindSchema,
        title: z.string().nullable(),
        sessionLabel: z.string().nullable(),
        performedOn: z.iso.date(),
        startedAt: z.iso.datetime({ offset: true }),
        durationSeconds: z.number().int().nonnegative(),
        structure: z.union([workoutStructureSchema, typedWorkoutStructureSchema]).nullable(),
        ...header,
        sets: z.array(recordedSet).min(1).max(300),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ workout: w }, context) => {
    const fail = () =>
      context.addIssue({
        code: "custom",
        message: "La instantánea del resultado no es coherente.",
      });
    if (santiagoDate(new Date(w.startedAt)) !== w.performedOn) fail();
    const slots = new Set<string>(),
      ids = new Set<string>();
    const positions = new Map<number, (typeof w.sets)[number]>();
    for (const s of w.sets) {
      const slot = `${s.position}:${s.setNumber}`,
        previous = positions.get(s.position);
      if (ids.has(s.id) || slots.has(slot)) fail();
      ids.add(s.id);
      slots.add(slot);
      if (
        previous &&
        (s.exerciseId !== previous.exerciseId ||
          s.exerciseName !== previous.exerciseName ||
          s.metrics.recordType !== previous.metrics.recordType)
      )
        fail();
      positions.set(s.position, s);
      if (w.structure) {
        const row = w.structure.exercises[s.position];
        if (
          !row ||
          row.exerciseId !== s.exerciseId ||
          row.prescribedExerciseId !== s.prescribedExerciseId ||
          (s.sessionExerciseId !== null && row.id !== s.sessionExerciseId)
        )
          fail();
        if (
          w.structure.version === 2 &&
          s.metrics.recordType !== w.structure.exercises[s.position]?.prescribed.recordType
        )
          fail();
      }
      if (w.structure?.version === 2) {
        if (s.setType === null) fail();
      } else if (s.metrics.recordType !== null || s.setType !== null || s.effort !== null) fail();
    }
    if (w.structure?.version === 2) {
      if (
        !w.exerciseNotes ||
        w.exerciseNotes.length !== w.structure.exercises.length ||
        w.exerciseNotes.some((n, i) => n.sessionExerciseId !== w.structure!.exercises[i]?.id)
      )
        fail();
    } else if (w.exerciseNotes !== null) fail();
  });
export type WorkoutCorrectionSnapshot = z.infer<typeof workoutCorrectionSnapshotSchema>;

/** Validate against the reviewed result, never infer identity or type from today's catalogue. */
export function validateWorkoutCorrection(
  snapshot: WorkoutCorrectionSnapshot,
  value: WorkoutCorrection,
): WorkoutCorrection {
  const base = workoutCorrectionSnapshotSchema.parse(snapshot),
    input = workoutCorrectionSchema.parse(value),
    w = base.workout;
  if (input.workoutId !== w.id || input.expectedRevision !== w.revision)
    throw Error("El entrenamiento cambió. Revisa la versión actual antes de guardar.");
  const byId = new Map(w.sets.map((s) => [s.id, s]));
  const typed = w.structure?.version === 2;
  for (const s of input.sets) {
    const original = byId.get(s.id);
    if (!original || original.metrics.recordType !== s.metrics.recordType)
      throw Error("La serie no corresponde al resultado revisado.");
    if (typed ? s.setType === null : s.setType !== null || s.effort !== null)
      throw Error("La corrección debe conservar el formato del resultado.");
  }
  if (typed) {
    if (
      !input.exerciseNotes ||
      input.exerciseNotes.length !== w.structure!.exercises.length ||
      input.exerciseNotes.some((n, i) => n.sessionExerciseId !== w.structure!.exercises[i]?.id)
    )
      throw Error("Revisa las notas de los ejercicios originales.");
  } else if (input.exerciseNotes !== null)
    throw Error("Este resultado conserva el formato anterior de notas.");
  return input;
}

export const workoutCorrectionReceiptSchema = z
  .object({
    version: z.literal(1),
    requestId: uuid,
    workoutId: uuid,
    revision: revision,
    status: z.enum(["updated", "duplicate", "removed"]),
  })
  .strict();
export type WorkoutCorrectionReceipt = z.infer<typeof workoutCorrectionReceiptSchema>;
