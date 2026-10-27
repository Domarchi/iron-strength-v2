import {
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingRecordedSetSchema,
  type RecordType,
  type TrainingMetrics,
  type TrainingPrescription,
  type TrainingRecordedSet,
} from "./training-metrics";

export type TrainingSetInput = {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  effort: string;
  setType: TrainingRecordedSet["setType"];
};
export type TrainingInputField = Exclude<keyof TrainingSetInput, "setType">;
const decimal = (raw: string, integer = false): number | null => {
  const value = raw.trim();
  if (!value) return null;
  if (!(integer ? /^\d+$/ : /^\d+(?:[.,]\d+)?$/).test(value)) return NaN;
  return Number(value.replace(",", "."));
};
/** Keeps unfinished input as text. Only a deliberate completion turns it into metrics. */
export function parseTrainingSetInput(
  kind: RecordType,
  input: TrainingSetInput,
): TrainingRecordedSet | null {
  const value = trainingRecordedSetSchema.safeParse({
    recordType: kind,
    weightKg: kind === null && input.weight.trim() === "" ? 0 : decimal(input.weight),
    reps: decimal(input.reps, true),
    durationSeconds: decimal(input.duration, true),
    distanceMeters: decimal(input.distance),
    effort: decimal(input.effort),
    setType: input.setType,
  });
  return value.success ? value.data : null;
}
/** No implicit copying of repetitions, time or distance. Weight targets win over history. */
export function prefillTrainingInput(
  input: TrainingPrescription,
  workIndex: number,
  last: TrainingMetrics | null,
  legacyLastWeightKg: number | null = null,
): TrainingSetInput {
  const p = trainingPrescriptionSchema.parse(input);
  if (!Number.isInteger(workIndex) || workIndex < 0 || workIndex >= p.sets)
    throw Error("La serie no corresponde a su objetivo.");
  const target = p.series?.[workIndex] ?? p.target;
  const previous = last === null ? null : trainingMetricsSchema.parse(last);
  const hasWeight = [
    null,
    "weight_reps",
    "weighted_bodyweight",
    "assisted_bodyweight",
    "weight_duration",
    "weight_distance",
  ].includes(p.recordType);
  const weight = hasWeight
    ? (target.targetWeightKg ??
      (previous?.recordType === p.recordType ? previous.weightKg : null) ??
      (p.recordType === null &&
      legacyLastWeightKg !== null &&
      Number.isFinite(legacyLastWeightKg) &&
      legacyLastWeightKg >= 0 &&
      legacyLastWeightKg <= 500
        ? legacyLastWeightKg
        : null))
    : null;
  return {
    weight: weight === null ? "" : String(weight).replace(".", ","),
    reps: "",
    duration: "",
    distance: "",
    effort: "",
    setType: "working",
  };
}
