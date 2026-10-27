import { z } from "zod";
import { coherentPrescriptionSeries } from "../../domain/prescription-series";
import { validRestSeconds, validSupersetLayout } from "../../domain/supersets";
import { workoutPayloadSchema } from "../workout/payload";
import {
  personalWorkoutPayloadSchema,
  personalWorkoutReceiptSchema,
} from "./personal-workout-contracts";

const weight = z
  .number()
  .min(0)
  .max(500)
  .refine((value) => Math.round(value * 100) / 100 === value);
const target = z
  .object({
    repsMin: z.number().int().min(1).max(100),
    repsMax: z.number().int().min(1).max(100),
    targetWeightKg: weight.nullable(),
  })
  .strict()
  .refine((value) => value.repsMin <= value.repsMax);
const prescription = target
  .extend({
    sets: z.number().int().min(1).max(10),
    series: z.array(target).min(1).max(10).nullable(),
  })
  .refine(coherentPrescriptionSeries);
const rest = z.number().int().nullable().refine(validRestSeconds);
export const workoutStructureSchema = z
  .object({
    version: z.literal(1),
    exercises: z
      .array(
        z
          .object({
            id: z.uuid(),
            exerciseId: z.uuid(),
            prescribedExerciseId: z.uuid().nullable(),
            prescribed: prescription,
            note: z.string().max(500).nullable(),
            restSeconds: rest,
            supersetId: z.uuid().nullable(),
            supersetRestSeconds: rest,
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict()
  .refine((value) => validSupersetLayout(value.exercises.map((row) => ({ ...row, name: "" }))));
export type WorkoutStructure = z.infer<typeof workoutStructureSchema>;

const assignedSet = workoutPayloadSchema.shape.sets.element
  .extend({
    sessionExerciseId: z.uuid(),
    prescribedExerciseId: z.uuid(),
    position: z.number().int().min(0).max(14),
    setNumber: z.number().int().min(1).max(20),
    weightKg: weight,
  })
  .strict();
const assigned = workoutPayloadSchema
  .extend({ sets: z.array(assignedSet).min(1).max(300) })
  .strict();
const common = { version: z.literal(2), id: z.uuid(), structure: workoutStructureSchema };
export const recordingPayloadSchema = z
  .discriminatedUnion("source", [
    z.object({ ...common, source: z.literal("assigned"), workout: assigned }).strict(),
    z
      .object({ ...common, source: z.literal("personal"), workout: personalWorkoutPayloadSchema })
      .strict(),
    z
      .object({ ...common, source: z.literal("free"), workout: personalWorkoutPayloadSchema })
      .strict(),
  ])
  .superRefine((value, context) => {
    const fail = (message: string) => context.addIssue({ code: "custom", message });
    if (value.id !== value.workout.id)
      fail("El resultado y su estructura deben compartir identidad.");
    if (value.source !== "assigned" && value.source !== value.workout.origin.kind)
      fail("El origen del registro no corresponde a su estructura.");
    if (Date.parse(value.workout.finishedAt) < Date.parse(value.workout.startedAt))
      fail("Revisa las fechas del entrenamiento.");
    for (const row of value.structure.exercises)
      if ((value.source === "assigned") !== (row.prescribedExerciseId !== null))
        fail("Revisa la identidad prescrita.");
    const slots = new Set<string>();
    for (const row of value.workout.sets) {
      const structure = value.structure.exercises[row.position],
        slot = `${row.position}:${row.setNumber}`;
      if (!structure || structure.exerciseId !== row.exerciseId || slots.has(slot))
        fail("La serie no corresponde a su posición en el resultado.");
      slots.add(slot);
    }
    if (value.source === "assigned")
      for (const row of value.workout.sets) {
        const structure = value.structure.exercises[row.position];
        if (
          structure &&
          (structure.id !== row.sessionExerciseId ||
            structure.prescribedExerciseId !== row.prescribedExerciseId)
        )
          fail("La serie no corresponde a su ejercicio prescrito.");
      }
  });
export type RecordingPayload = z.infer<typeof recordingPayloadSchema>;
export const recordingReceiptSchema = personalWorkoutReceiptSchema;
export const recordingRequestSchema = z
  .object({ version: z.literal(2), payload: recordingPayloadSchema })
  .strict();
export const recordingSaveSchema = z
  .object({
    version: z.literal(2),
    ok: z.literal(true),
    status: z.enum(["created", "duplicate"]),
    workoutId: z.uuid(),
  })
  .strict();
