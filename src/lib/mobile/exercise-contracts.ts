import { z } from "zod";
import { MUSCLE_GROUPS } from "../../domain/schemas";
import { LIMITS } from "../../domain/limits";

export const MOBILE_CATALOG_LIMIT = 1000;
export const mobileCatalogEntrySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(LIMITS.nameMax),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: z.string().max(LIMITS.nameMax).nullable(),
  isBodyweight: z.boolean(),
  progressionIncrementKg: z.number().positive().max(LIMITS.incrementMaxKg),
});
export type MobileCatalogEntry = z.infer<typeof mobileCatalogEntrySchema>;
export const mobileCatalogSchema = z.object({
  version: z.literal(1),
  exercises: z
    .array(mobileCatalogEntrySchema)
    .max(MOBILE_CATALOG_LIMIT)
    .refine(
      (items) => new Set(items.map((item) => item.id.toLowerCase())).size === items.length,
      "El catálogo contiene identificadores repetidos.",
    ),
});

const cursorSchema = z.object({ startedAt: z.iso.datetime({ offset: true }), id: z.uuid() });
export type MobileExerciseHistoryCursor = z.infer<typeof cursorSchema>;
export function parseExerciseHistoryCursor(value: string): MobileExerciseHistoryCursor | null {
  if (value.length > 256) return null;
  const parts = value.split("|");
  if (parts.length !== 2) return null;
  const parsed = cursorSchema.safeParse({ startedAt: parts[0], id: parts[1] });
  return parsed.success ? parsed.data : null;
}
export const exerciseHistoryCursorString = (cursor: MobileExerciseHistoryCursor) =>
  cursor.startedAt + "|" + cursor.id;

const historyItem = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  date: z.iso.date(),
  sessionLabel: z.string().max(100).nullable(),
  sets: z
    .array(
      z.object({
        id: z.uuid(),
        position: z.number().int().min(0),
        setNumber: z.number().int().min(1),
        weightKg: z.number().min(0).max(LIMITS.weightMaxKg),
        reps: z.number().int().min(1).max(LIMITS.repsMax),
        isWarmup: z.boolean(),
      }),
    )
    .min(1)
    .max(300),
});
export const mobileExerciseDetailSchema = z.object({
  version: z.literal(1),
  exercise: mobileCatalogEntrySchema,
  history: z
    .object({
      items: z.array(historyItem).max(10),
      nextCursor: z.string().max(256).nullable(),
    })
    .refine(({ items, nextCursor }) => {
      if (new Set(items.map((item) => item.id.toLowerCase())).size !== items.length) return false;
      if (nextCursor === null) return true;
      const cursor = parseExerciseHistoryCursor(nextCursor),
        last = items.at(-1);
      return !!cursor && !!last && cursor.id === last.id && cursor.startedAt === last.startedAt;
    }, "La página de historial está incompleta."),
});
export type MobileExerciseDetail = z.infer<typeof mobileExerciseDetailSchema>;
