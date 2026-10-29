import { z } from "zod";
import {
  athleteNoteSchema,
  recordTypeSchema,
  trainingMetricsSchema,
  trainingSetDetailsSchema,
} from "../../domain/training-metrics";
import {
  MOBILE_CATALOG_LIMIT,
  mobileCatalogEntrySchema,
  parseExerciseHistoryCursor,
} from "./exercise-contracts";
import { workoutSourceKindSchema } from "./personal-workout-contracts";
const uuid = z.uuid().transform((v) => v.toLowerCase());
export const typedCatalogEntrySchema = mobileCatalogEntrySchema
  .extend({ id: uuid, recordType: recordTypeSchema })
  .strict();
export type TypedCatalogEntry = z.infer<typeof typedCatalogEntrySchema>;
export const typedCatalogSchema = z
  .object({
    version: z.literal(2),
    exercises: z
      .array(typedCatalogEntrySchema)
      .max(MOBILE_CATALOG_LIMIT)
      .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length),
  })
  .strict();
const historySet = z
  .object({
    id: uuid,
    position: z.number().int().nonnegative(),
    setNumber: z.number().int().positive(),
    metrics: trainingMetricsSchema,
    ...trainingSetDetailsSchema.shape,
  })
  .strict();
const item = z
  .object({
    id: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    date: z.iso.date(),
    sessionLabel: z.string().max(100).nullable(),
    sourceKind: workoutSourceKindSchema,
    title: z.string().max(100).nullable(),
    exerciseNotes: z
      .array(
        z.object({ position: z.number().int().nonnegative(), note: athleteNoteSchema }).strict(),
      )
      .max(15)
      .refine((rows) => new Set(rows.map((r) => r.position)).size === rows.length),
    sets: z
      .array(historySet)
      .min(1)
      .max(300)
      .refine(
        (sets) =>
          new Set(sets.map((s) => s.id)).size === sets.length &&
          new Set(sets.map((s) => `${s.position}:${s.setNumber}`)).size === sets.length,
      ),
  })
  .strict();
export const typedExerciseHistorySchema = z
  .object({ items: z.array(item).max(10), nextCursor: z.string().max(256).nullable() })
  .strict()
  .refine((h) => {
    if (new Set(h.items.map((i) => i.id)).size !== h.items.length) return false;
    if (h.nextCursor === null) return true;
    const cursor = parseExerciseHistoryCursor(h.nextCursor),
      last = h.items.at(-1);
    return (
      !!cursor &&
      !!last &&
      cursor.id.toLowerCase() === last.id &&
      cursor.startedAt === last.startedAt
    );
  });
export const typedExerciseDetailSchema = z
  .object({
    version: z.literal(2),
    exercise: typedCatalogEntrySchema,
    history: typedExerciseHistorySchema,
  })
  .strict();
export type TypedExerciseDetail = z.infer<typeof typedExerciseDetailSchema>;
