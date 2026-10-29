import {
  formatWeight,
  formatDistance,
  type WeightUnit,
  type DistanceUnit,
} from "../../../src/domain/training-tools";
import type {
  RecordType,
  TrainingRecordedSet,
  TrainingTarget,
} from "../../../src/domain/training-metrics";
export function formatTrainingTarget(
  t: TrainingTarget,
  units: { weightUnit: WeightUnit; distanceUnit: DistanceUnit } = {
    weightUnit: "kg",
    distanceUnit: "m",
  },
): string {
  return [
    t.repsMin === null
      ? null
      : `${t.repsMin}${t.repsMax === t.repsMin ? "" : `–${t.repsMax}`} reps`,
    t.targetWeightKg === null ? null : formatWeight(t.targetWeightKg, units.weightUnit),
    t.targetDurationSeconds === null ? null : `${t.targetDurationSeconds} s`,
    t.targetDistanceMeters === null
      ? null
      : formatDistance(t.targetDistanceMeters, units.distanceUnit),
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
export const RECORD_TYPE_LABELS: Record<NonNullable<RecordType>, string> = {
  weight_reps: "Peso y repeticiones",
  bodyweight_reps: "Peso corporal",
  weighted_bodyweight: "Peso corporal con carga",
  assisted_bodyweight: "Peso corporal asistido",
  duration: "Tiempo",
  weight_duration: "Peso y tiempo",
  distance_duration: "Distancia y tiempo",
  weight_distance: "Peso y distancia",
};
export const SET_TYPE_LABELS: Record<TrainingRecordedSet["setType"], string> = {
  working: "Serie",
  warmup: "Calentamiento",
  failure: "Al fallo",
  drop: "Descendente",
};
