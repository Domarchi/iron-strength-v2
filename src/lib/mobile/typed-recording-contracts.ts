import { z } from "zod";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingSetDetailsSchema,
} from "../../domain/training-metrics";
import { validRestSeconds, validSupersetLayout } from "../../domain/supersets";
import { workoutPayloadSchema } from "../workout/payload";
import {
  personalWorkoutOriginSchema,
  personalWorkoutReceiptSchema,
  workoutSourceKindSchema,
} from "./personal-workout-contracts";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const rest = z.number().int().nullable().refine(validRestSeconds);
const row = z
  .object({
    id: uuid,
    exerciseId: uuid,
    prescribedExerciseId: uuid.nullable(),
    prescribed: trainingPrescriptionSchema,
    note: athleteNoteSchema,
    restSeconds: rest,
    supersetId: uuid.nullable(),
    supersetRestSeconds: rest,
  })
  .strict();
export const typedWorkoutStructureSchema = z
  .object({ version: z.literal(2), exercises: z.array(row).min(1).max(15) })
  .strict()
  .refine(
    (value) =>
      new Set(value.exercises.map((r) => r.id)).size === value.exercises.length &&
      validSupersetLayout(value.exercises.map((r) => ({ ...r, name: "" }))),
  );
const set = z
  .object({
    exerciseId: uuid,
    position: z.number().int().min(0).max(14),
    setNumber: z.number().int().min(1).max(20),
    metrics: trainingMetricsSchema,
    ...trainingSetDetailsSchema.shape,
  })
  .strict();
const assignedSet = set.extend({
  sessionExerciseId: uuid,
  prescribedExerciseId: uuid,
  exerciseName: z.string().min(1).max(100),
});
export const trainingExerciseNotesSchema = z
  .array(z.object({ sessionExerciseId: uuid, note: athleteNoteSchema }).strict())
  .min(1)
  .max(15);
const header = workoutPayloadSchema
  .pick({
    id: true,
    startedAt: true,
    finishedAt: true,
    durationSeconds: true,
    perceivedEffort: true,
    note: true,
  })
  .extend({
    id: uuid,
    version: z.literal(2),
    exerciseNotes: trainingExerciseNotesSchema,
  });
const ownWorkout = header
  .extend({
    origin: personalWorkoutOriginSchema,
    title: z.string().trim().min(1).max(100),
    sets: z.array(set).min(1).max(300),
  })
  .strict();
const assignedWorkout = header
  .extend({
    programId: uuid,
    programSessionId: uuid,
    sessionLabel: z.string().min(1).max(10),
    sets: z.array(assignedSet).min(1).max(300),
  })
  .strict();
const common = { version: z.literal(3), id: uuid, structure: typedWorkoutStructureSchema };
export const typedRecordingPayloadSchema = z
  .discriminatedUnion("source", [
    z.object({ ...common, source: z.literal("assigned"), workout: assignedWorkout }).strict(),
    z.object({ ...common, source: z.literal("personal"), workout: ownWorkout }).strict(),
    z.object({ ...common, source: z.literal("free"), workout: ownWorkout }).strict(),
  ])
  .superRefine((value, context) => {
    const fail = (message: string) => context.addIssue({ code: "custom", message });
    if (
      value.id !== value.workout.id ||
      Date.parse(value.workout.finishedAt) < Date.parse(value.workout.startedAt)
    )
      fail("Revisa la identidad y fechas del cierre.");
    if (value.source !== "assigned" && value.workout.origin.kind !== value.source)
      fail("El origen del entrenamiento no coincide.");
    if (
      value.structure.exercises.some(
        (r) => (value.source === "assigned") !== (r.prescribedExerciseId !== null),
      )
    )
      fail("Revisa la identidad prescrita.");
    if (
      value.workout.exerciseNotes.length !== value.structure.exercises.length ||
      value.workout.exerciseNotes.some(
        (r, i) => r.sessionExerciseId !== value.structure.exercises[i]?.id,
      )
    )
      fail("Las notas deben corresponder a las filas del entrenamiento.");
    const slots = new Set<string>();
    for (const item of value.workout.sets) {
      const source = value.structure.exercises[item.position],
        slot = `${item.position}:${item.setNumber}`;
      if (
        !source ||
        source.exerciseId !== item.exerciseId ||
        source.prescribed.recordType !== item.metrics.recordType ||
        slots.has(slot)
      )
        fail("La serie no corresponde a su fila o tipo.");
      slots.add(slot);
    }
    if (value.source === "assigned")
      for (const item of value.workout.sets) {
        const source = value.structure.exercises[item.position];
        if (
          source &&
          (source.id !== item.sessionExerciseId ||
            source.prescribedExerciseId !== item.prescribedExerciseId)
        )
          fail("La serie no corresponde a la prescripción asignada.");
      }
  });
export type TypedRecordingPayload = z.infer<typeof typedRecordingPayloadSchema>;
export const typedRecordingRequestSchema = z
  .object({ version: z.literal(3), payload: typedRecordingPayloadSchema })
  .strict();
export const typedRecordingReceiptSchema = personalWorkoutReceiptSchema;
export const typedRecordingSaveSchema = z
  .object({
    version: z.literal(3),
    ok: z.literal(true),
    status: z.enum(["created", "duplicate"]),
    workoutId: uuid,
  })
  .strict();

const resultSet = z
  .object({
    id: uuid,
    setNumber: z.number().int().min(1).max(20),
    metrics: trainingMetricsSchema,
    ...trainingSetDetailsSchema.shape,
  })
  .strict();
export const typedWorkoutSchema = z
  .object({
    version: z.literal(3),
    workout: z
      .object({
        id: uuid,
        sourceKind: workoutSourceKindSchema,
        title: z.string().nullable(),
        personalRoutineId: uuid.nullable(),
        personalRoutineRevision: z.number().int().nonnegative().nullable(),
        programName: z.string().nullable(),
        sessionLabel: z.string().nullable(),
        startedAt: z.iso.datetime({ offset: true }),
        performedOn: z.iso.date(),
        durationSeconds: z.number().int().nonnegative(),
        perceivedEffort: z.number().nullable(),
        note: z.string().nullable(),
        structure: typedWorkoutStructureSchema,
        exercises: z
          .array(
            row.extend({
              position: z.number().int().min(0).max(14),
              name: z.string(),
              prescribedExerciseName: z.string().nullable(),
              athleteNote: athleteNoteSchema,
              sets: z.array(resultSet).max(20),
            }),
          )
          .min(1)
          .max(15),
        summary: z
          .object({
            workingSets: z.number().int().nonnegative(),
            volumeKg: z.number().nonnegative(),
            bodyweightReps: z.number().int().nonnegative(),
            exerciseCount: z.number().int().nonnegative(),
            recordedSeconds: z.number().int().nonnegative(),
            distanceMeters: z.number().nonnegative(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .refine(
    ({ workout: w }) =>
      w.exercises.length === w.structure.exercises.length &&
      w.exercises.every(
        (r, i) =>
          r.position === i &&
          r.id === w.structure.exercises[i].id &&
          r.exerciseId === w.structure.exercises[i].exerciseId &&
          r.sets.every((s) => s.metrics.recordType === r.prescribed.recordType),
      ),
  );
export type TypedWorkout = z.infer<typeof typedWorkoutSchema>;
