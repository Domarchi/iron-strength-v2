import { z } from "zod";
import { MUSCLE_GROUPS } from "../../domain/schemas";
import { recordTypeSchema } from "../../domain/training-metrics";
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const personalExerciseFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    muscleGroup: z.enum(MUSCLE_GROUPS),
    equipment: z.string().trim().min(1).max(50).nullable(),
    isBodyweight: z.boolean(),
    progressionIncrementKg: z
      .number()
      .min(0.01)
      .max(20)
      .refine((n) => Math.round(n * 100) / 100 === n),
    recordType: recordTypeSchema,
  })
  .strict();
export type PersonalExerciseFields = z.infer<typeof personalExerciseFieldsSchema>;
export const personalExerciseEntrySchema = personalExerciseFieldsSchema
  .extend({
    id: uuid,
    revision: z.number().int().positive(),
    archivedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export const personalExerciseLibrarySchema = z
  .object({
    version: z.literal(1),
    userId: uuid,
    exercises: z
      .array(personalExerciseEntrySchema)
      .max(1000)
      .refine((rows) => new Set(rows.map((e) => e.id)).size === rows.length),
  })
  .strict();
const identity = { version: z.literal(1), requestId: uuid, targetId: uuid };
export const personalExerciseMutationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...identity,
      operation: z.literal("create"),
      expectedRevision: z.literal(0),
      data: personalExerciseFieldsSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      operation: z.literal("update"),
      expectedRevision: z.number().int().positive(),
      data: personalExerciseFieldsSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      operation: z.literal("archive"),
      expectedRevision: z.number().int().positive(),
      data: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...identity,
      operation: z.literal("restore"),
      expectedRevision: z.number().int().positive(),
      data: z.object({}).strict(),
    })
    .strict(),
]);
export const personalExerciseResultSchema = z
  .object({
    ...identity,
    revision: z.number().int().positive().nullable(),
    status: z.enum(["created", "updated", "archived", "restored", "removed"]),
    duplicate: z.boolean(),
  })
  .strict()
  .refine(
    (r) =>
      (r.status === "removed") === (r.revision === null) && (r.status !== "removed" || r.duplicate),
  );
export type PersonalExerciseMutation = z.infer<typeof personalExerciseMutationSchema>;
export type PersonalExerciseLibrary = z.infer<typeof personalExerciseLibrarySchema>;
