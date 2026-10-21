import { z } from "zod";
import { LIMITS } from "./limits";
import { fromFormNumber } from "./numbers";
export const seriesTargetSchema = z
  .object({
    repsMin: z.preprocess(fromFormNumber, z.number().int().min(LIMITS.repsMin).max(LIMITS.repsMax)),
    repsMax: z.preprocess(fromFormNumber, z.number().int().min(LIMITS.repsMin).max(LIMITS.repsMax)),
    targetWeightKg: z.preprocess(
      fromFormNumber,
      z
        .number()
        .min(LIMITS.weightMinKg)
        .max(LIMITS.weightMaxKg)
        .refine((n) => Math.round(n * 100) / 100 === n, "Máximo 2 decimales")
        .nullish()
        .transform((n) => n ?? null),
    ),
  })
  .strict()
  .refine((t) => t.repsMin <= t.repsMax, {
    message: "El mínimo de repeticiones no puede superar al máximo",
    path: ["repsMax"],
  });
export const prescribedSeriesSchema = z
  .array(seriesTargetSchema)
  .min(LIMITS.setsMin)
  .max(LIMITS.setsMax);
export type SeriesTarget = z.infer<typeof seriesTargetSchema>;
export type SeriesPrescription = {
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  series?: SeriesTarget[] | null;
};
function summarize(series: SeriesTarget[]) {
  return {
    sets: series.length,
    repsMin: Math.min(...series.map((t) => t.repsMin)),
    repsMax: Math.max(...series.map((t) => t.repsMax)),
    targetWeightKg: series.every((t) => t.targetWeightKg === series[0].targetWeightKg)
      ? series[0].targetWeightKg
      : null,
  };
}
export function seriesSummary(series: SeriesTarget[]) {
  return summarize(prescribedSeriesSchema.parse(series));
}
export function coherentPrescriptionSeries(p: SeriesPrescription): boolean {
  if (p.series == null) return true;
  const parsed = prescribedSeriesSchema.safeParse(p.series);
  if (!parsed.success) return false;
  const summary = summarize(parsed.data);
  return (
    p.sets === summary.sets &&
    p.repsMin === summary.repsMin &&
    p.repsMax === summary.repsMax &&
    p.targetWeightKg === summary.targetWeightKg
  );
}
export function isUniformPrescription(p: SeriesPrescription): boolean {
  if (p.series == null) return true;
  const parsed = prescribedSeriesSchema.safeParse(p.series);
  if (!parsed.success) return false;
  const first = parsed.data[0];
  return parsed.data.every(
    (t) =>
      t.repsMin === first.repsMin &&
      t.repsMax === first.repsMax &&
      t.targetWeightKg === first.targetWeightKg,
  );
}
export function seriesTargetAt(p: SeriesPrescription, index: number): SeriesTarget | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return p.series
    ? (p.series[index] ?? null)
    : { repsMin: p.repsMin, repsMax: p.repsMax, targetWeightKg: p.targetWeightKg };
}
export function resizePrescribedSeries(series: SeriesTarget[], count: number): SeriesTarget[] {
  z.number().int().min(LIMITS.setsMin).max(LIMITS.setsMax).parse(count);
  const source = prescribedSeriesSchema.parse(series);
  return Array.from({ length: count }, (_, i) => ({ ...source[Math.min(i, source.length - 1)] }));
}
