import { z } from "zod";
import { seriesDraftSchema, toSeriesDraft } from "./series-draft";
import type { SeriesTarget } from "@/domain/prescription-series";
import { sessionExerciseSchema } from "@/domain/schemas";
export const alternativeDraftSchema = z.object({
  exerciseId: z.string(),
  sets: z.string(),
  repsMin: z.string(),
  repsMax: z.string(),
  targetWeightKg: z.string(),
  series: seriesDraftSchema.nullable().optional(),
});
export type AlternativeDraft = z.infer<typeof alternativeDraftSchema>;
export type AlternativeInput = {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  series?: SeriesTarget[] | null;
};
export type AlternativeRow = AlternativeInput & { id: string; name: string; archived: boolean };
export const alternativeInputSchema = sessionExerciseSchema.transform(
  ({ note: _note, ...row }) => row,
);
export const alternativeRequestSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  exerciseRowId: z.uuid(),
  alternatives: z.array(alternativeInputSchema).max(3),
});
export type AlternativeRequest = z.infer<typeof alternativeRequestSchema>;
export function alternativeDraft(row: AlternativeInput): AlternativeDraft {
  return {
    exerciseId: row.exerciseId,
    sets: String(row.sets),
    repsMin: String(row.repsMin),
    repsMax: String(row.repsMax),
    targetWeightKg: row.targetWeightKg === null ? "" : String(row.targetWeightKg),
    ...(row.series !== undefined
      ? { series: row.series === null ? null : toSeriesDraft(row.series) }
      : {}),
  };
}
export function validateAlternatives(
  originalId: string,
  input: unknown,
): { ok: true; rows: AlternativeInput[] } | { ok: false; error: string } {
  const parsed = z.array(alternativeInputSchema).max(3).safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Revisa las series, repeticiones y pesos. Puedes indicar hasta tres alternativas.",
    };
  if (
    parsed.data.some((row) => row.exerciseId === originalId) ||
    new Set(parsed.data.map((row) => row.exerciseId)).size !== parsed.data.length
  )
    return {
      ok: false,
      error: "Las alternativas deben ser distintas entre sí y del ejercicio original.",
    };
  return { ok: true, rows: parsed.data };
}
