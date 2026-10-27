import { z } from "zod";

export const RECORD_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "weight_duration",
  "distance_duration",
  "weight_distance",
] as const;
export const recordTypeSchema = z.enum(RECORD_TYPES).nullable();
export type RecordType = z.infer<typeof recordTypeSchema>;
export const SET_TYPES = ["working", "warmup", "failure", "drop"] as const;
const setType = z.enum(SET_TYPES);
const effort = z.number().min(1).max(10).multipleOf(0.5).nullable();
export const athleteNoteSchema = z
  .string()
  .refine((value) => Array.from(value).length <= 500)
  .nullable();
const precise = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((n) => Math.round(n * 100) / 100 === n);
const weight = precise(0, 500).nullable();
const reps = z.number().int().min(1).max(100).nullable();
const duration = z.number().int().min(1).max(86400).nullable();
const distance = precise(0.01, 1000000).nullable();
type Dimension = "weightKg" | "reps" | "durationSeconds" | "distanceMeters";
const dimensions: Record<NonNullable<RecordType>, readonly Dimension[]> = {
  weight_reps: ["weightKg", "reps"],
  bodyweight_reps: ["reps"],
  weighted_bodyweight: ["weightKg", "reps"],
  assisted_bodyweight: ["weightKg", "reps"],
  duration: ["durationSeconds"],
  weight_duration: ["weightKg", "durationSeconds"],
  distance_duration: ["distanceMeters", "durationSeconds"],
  weight_distance: ["weightKg", "distanceMeters"],
};
const keys: Dimension[] = ["weightKg", "reps", "durationSeconds", "distanceMeters"];
const fields = {
  recordType: recordTypeSchema,
  weightKg: weight,
  reps,
  durationSeconds: duration,
  distanceMeters: distance,
};
type Metrics = {
  recordType: RecordType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};
const validDimensions = (value: Metrics) => {
  const used = dimensions[value.recordType ?? "weight_reps"];
  return keys.every((key) => used.includes(key) === (value[key] !== null));
};
export const trainingMetricsSchema = z
  .object(fields)
  .strict()
  .refine(validDimensions, "Revisa las métricas del tipo de ejercicio.");
export type TrainingMetrics = z.infer<typeof trainingMetricsSchema>;
export const trainingSetDetailsSchema = z.object({ setType, effort }).strict();
export const trainingRecordedSetSchema = z
  .object({ ...fields, setType, effort })
  .strict()
  .refine(validDimensions);
export type TrainingRecordedSet = z.infer<typeof trainingRecordedSetSchema>;

export const trainingTargetSchema = z
  .object({
    repsMin: reps,
    repsMax: reps,
    targetWeightKg: weight,
    targetDurationSeconds: duration,
    targetDistanceMeters: distance,
  })
  .strict();
export type TrainingTarget = z.infer<typeof trainingTargetSchema>;
function validTarget(kind: RecordType, target: TrainingTarget): boolean {
  const used = dimensions[kind ?? "weight_reps"];
  return (
    (used.includes("reps")
      ? target.repsMin !== null && target.repsMax !== null && target.repsMin <= target.repsMax
      : target.repsMin === null && target.repsMax === null) &&
    (used.includes("weightKg") || target.targetWeightKg === null) &&
    (used.includes("durationSeconds") || target.targetDurationSeconds === null) &&
    (used.includes("distanceMeters") || target.targetDistanceMeters === null)
  );
}
export function trainingTargetSummary(targets: TrainingTarget[]): TrainingTarget {
  if (!targets.length) throw Error("Se requiere al menos un objetivo.");
  const valid = targets.map((t) => trainingTargetSchema.parse(t));
  const same = (key: keyof TrainingTarget) =>
    valid.every((t) => t[key] === valid[0][key]) ? valid[0][key] : null;
  return {
    repsMin: valid.every((t) => t.repsMin !== null)
      ? Math.min(...valid.map((t) => t.repsMin!))
      : null,
    repsMax: valid.every((t) => t.repsMax !== null)
      ? Math.max(...valid.map((t) => t.repsMax!))
      : null,
    targetWeightKg: same("targetWeightKg"),
    targetDurationSeconds: same("targetDurationSeconds"),
    targetDistanceMeters: same("targetDistanceMeters"),
  };
}
export const trainingPrescriptionSchema = z
  .object({
    recordType: recordTypeSchema,
    sets: z.number().int().min(1).max(10),
    target: trainingTargetSchema,
    series: z.array(trainingTargetSchema).min(1).max(10).nullable(),
  })
  .strict()
  .refine((value) => {
    if (!validTarget(value.recordType, value.target)) return false;
    if (value.series === null) return true;
    if (
      value.series.length !== value.sets ||
      value.series.some((t) => !validTarget(value.recordType, t))
    )
      return false;
    const summary = trainingTargetSummary(value.series);
    return (Object.keys(summary) as (keyof TrainingTarget)[]).every(
      (key) => value.target[key] === summary[key],
    );
  }, "Revisa los objetivos y el detalle por serie.");
export type TrainingPrescription = z.infer<typeof trainingPrescriptionSchema>;

export function legacyTrainingSet(value: {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}): TrainingRecordedSet {
  return trainingRecordedSetSchema.parse({
    recordType: null,
    weightKg: value.weightKg,
    reps: value.reps,
    durationSeconds: null,
    distanceMeters: null,
    setType: value.isWarmup ? "warmup" : "working",
    effort: null,
  });
}
export function trainingTotals(input: TrainingRecordedSet[]) {
  const result = {
    workingSets: 0,
    externalVolumeKg: 0,
    bodyweightReps: 0,
    durationSeconds: 0,
    distanceMeters: 0,
  };
  for (const value of input) {
    const row = trainingRecordedSetSchema.parse(value);
    if (row.setType === "warmup") continue;
    result.workingSets++;
    if (row.recordType === null) {
      if (row.weightKg === 0) result.bodyweightReps += row.reps!;
      else result.externalVolumeKg += row.weightKg! * row.reps!;
    } else {
      if (row.recordType === "weight_reps" || row.recordType === "weighted_bodyweight")
        result.externalVolumeKg += row.weightKg! * row.reps!;
      if (
        ["bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight"].includes(row.recordType)
      )
        result.bodyweightReps += row.reps!;
      result.durationSeconds += row.durationSeconds ?? 0;
      result.distanceMeters += row.distanceMeters ?? 0;
    }
  }
  result.externalVolumeKg = Math.round(result.externalVolumeKg * 100) / 100;
  result.distanceMeters = Math.round(result.distanceMeters * 100) / 100;
  return result;
}
export function formatTrainingMetrics(input: TrainingMetrics): string {
  const row = trainingMetricsSchema.parse(input);
  const n = (value: number | null) => value!.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  switch (row.recordType) {
    case "bodyweight_reps":
      return `${n(row.reps)} reps`;
    case "weighted_bodyweight":
      return `+${n(row.weightKg)} kg × ${n(row.reps)} reps`;
    case "assisted_bodyweight":
      return `${n(row.weightKg)} kg de asistencia × ${n(row.reps)} reps`;
    case "duration":
      return `${n(row.durationSeconds)} s`;
    case "weight_duration":
      return `${n(row.weightKg)} kg × ${n(row.durationSeconds)} s`;
    case "distance_duration":
      return `${n(row.distanceMeters)} m · ${n(row.durationSeconds)} s`;
    case "weight_distance":
      return `${n(row.weightKg)} kg × ${n(row.distanceMeters)} m`;
    default:
      return `${n(row.weightKg)} kg × ${n(row.reps)} reps`;
  }
}
