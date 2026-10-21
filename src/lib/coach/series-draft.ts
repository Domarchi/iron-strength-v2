import { z } from "zod";
import {
  prescribedSeriesSchema,
  seriesSummary,
  type SeriesTarget,
} from "@/domain/prescription-series";
import type { PrescriptionField } from "@/domain/schemas";
export const seriesDraftTargetSchema = z
  .object({ repsMin: z.string(), repsMax: z.string(), targetWeightKg: z.string() })
  .strict();
export const seriesDraftSchema = z.array(seriesDraftTargetSchema).min(1).max(10);
export type SeriesDraft = z.infer<typeof seriesDraftTargetSchema>;
export const toSeriesDraft = (series: SeriesTarget[]): SeriesDraft[] =>
  series.map((t) => ({
    repsMin: String(t.repsMin),
    repsMax: String(t.repsMax),
    targetWeightKg: t.targetWeightKg === null ? "" : String(t.targetWeightKg),
  }));
type CommonDraft = { sets: string; repsMin: string; repsMax: string; targetWeightKg: string };
export function seriesDraftSummary(series: SeriesDraft[]): CommonDraft | null {
  const parsed = prescribedSeriesSchema.safeParse(series);
  if (!parsed.success) return null;
  const value = seriesSummary(parsed.data);
  return {
    sets: String(value.sets),
    repsMin: String(value.repsMin),
    repsMax: String(value.repsMax),
    targetWeightKg: value.targetWeightKg === null ? "" : String(value.targetWeightKg),
  };
}
export function patchSeriesDraft(
  source: SeriesTarget[],
  draft: CommonDraft,
  fields: readonly PrescriptionField[],
): SeriesDraft[] {
  const old = toSeriesDraft(source),
    count = Number(draft.sets);
  const resized =
    fields.includes("sets") && Number.isInteger(count) && count >= 1 && count <= 10
      ? Array.from({ length: count }, (_, i) => ({ ...old[Math.min(i, old.length - 1)] }))
      : old;
  return resized.map((t) => ({
    ...t,
    repsMin: fields.includes("repsMin") ? draft.repsMin : t.repsMin,
    repsMax: fields.includes("repsMax") ? draft.repsMax : t.repsMax,
    targetWeightKg: fields.includes("targetWeightKg") ? draft.targetWeightKg : t.targetWeightKg,
  }));
}
