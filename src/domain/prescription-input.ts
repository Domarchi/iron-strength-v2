import { z } from "zod";
import {
  recordTypeSchema,
  trainingPrescriptionSchema,
  trainingTargetSummary,
  type RecordType,
  type TrainingPrescription,
  type TrainingTarget,
} from "./training-metrics";

const text = z.string().max(30);
const targetInputSchema = z
  .object({
    repsMin: text,
    repsMax: text,
    targetWeightKg: text,
    targetDurationSeconds: text,
    targetDistanceMeters: text,
  })
  .strict();
export type PrescriptionTargetInput = z.infer<typeof targetInputSchema>;
type Field = keyof PrescriptionTargetInput;
export const prescriptionInputSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("uniform"),
      recordType: recordTypeSchema,
      sets: text,
      target: targetInputSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal("series"),
      recordType: recordTypeSchema,
      series: z.array(targetInputSchema).min(1).max(10),
    })
    .strict(),
]);
export type PrescriptionInput = z.infer<typeof prescriptionInputSchema>;
const fields: Record<NonNullable<RecordType>, readonly Field[]> = {
  weight_reps: ["repsMin", "repsMax", "targetWeightKg"],
  bodyweight_reps: ["repsMin", "repsMax"],
  weighted_bodyweight: ["repsMin", "repsMax", "targetWeightKg"],
  assisted_bodyweight: ["repsMin", "repsMax", "targetWeightKg"],
  duration: ["targetDurationSeconds"],
  weight_duration: ["targetWeightKg", "targetDurationSeconds"],
  distance_duration: ["targetDurationSeconds", "targetDistanceMeters"],
  weight_distance: ["targetWeightKg", "targetDistanceMeters"],
};
export function prescriptionInputFields(kind: RecordType): Field[] {
  return [...fields[recordTypeSchema.parse(kind) ?? "weight_reps"]];
}
export function defaultPrescriptionInput(
  kind: RecordType,
): Extract<PrescriptionInput, { mode: "uniform" }> {
  const used = prescriptionInputFields(kind);
  return {
    mode: "uniform",
    recordType: kind,
    sets: "3",
    target: {
      repsMin: used.includes("repsMin") ? "8" : "",
      repsMax: used.includes("repsMax") ? "12" : "",
      targetWeightKg: "",
      targetDurationSeconds: "",
      targetDistanceMeters: "",
    },
  };
}
const raw = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
function targetToInput(t: TrainingTarget): PrescriptionTargetInput {
  return {
    repsMin: raw(t.repsMin),
    repsMax: raw(t.repsMax),
    targetWeightKg: raw(t.targetWeightKg),
    targetDurationSeconds: raw(t.targetDurationSeconds),
    targetDistanceMeters: raw(t.targetDistanceMeters),
  };
}
export function prescriptionToInput(value: TrainingPrescription): PrescriptionInput {
  const p = trainingPrescriptionSchema.parse(value);
  return p.series === null
    ? {
        mode: "uniform",
        recordType: p.recordType,
        sets: String(p.sets),
        target: targetToInput(p.target),
      }
    : { mode: "series", recordType: p.recordType, series: p.series.map(targetToInput) };
}
function numeric(value: string, integer = false): number {
  const n = value.trim();
  const pattern = integer ? /^\d+$/ : /^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/;
  if (!pattern.test(n))
    throw Error(
      integer
        ? "Usa un número entero sin separador de miles."
        : "Completa el número sin separador de miles; admite hasta dos decimales.",
    );
  // The closed input limits text to 30 characters and excludes exponents; conversion is finite.
  return Number(n.replace(",", "."));
}
function parseTarget(input: PrescriptionTargetInput, kind: RecordType): TrainingTarget {
  const used = new Set(prescriptionInputFields(kind));
  for (const field of Object.keys(input) as Field[])
    if (!used.has(field) && input[field].trim() !== "")
      throw Error("El objetivo incluye una dimensión que no corresponde al ejercicio.");
  const optional = (key: Field, integer = false) =>
    input[key].trim() === "" ? null : numeric(input[key], integer);
  return {
    repsMin: used.has("repsMin") ? numeric(input.repsMin, true) : null,
    repsMax: used.has("repsMax") ? numeric(input.repsMax, true) : null,
    targetWeightKg: optional("targetWeightKg"),
    targetDurationSeconds: optional("targetDurationSeconds", true),
    targetDistanceMeters: optional("targetDistanceMeters"),
  };
}
/** Only deliberate preparation normalizes text. Callers retain the raw document on failure. */
export function parsePrescriptionInput(value: unknown): TrainingPrescription {
  const input = prescriptionInputSchema.parse(value);
  if (input.mode === "uniform")
    return trainingPrescriptionSchema.parse({
      recordType: input.recordType,
      sets: numeric(input.sets, true),
      target: parseTarget(input.target, input.recordType),
      series: null,
    });
  const series = input.series.map((row) => parseTarget(row, input.recordType));
  return trainingPrescriptionSchema.parse({
    recordType: input.recordType,
    sets: series.length,
    target: trainingTargetSummary(series),
    series,
  });
}
