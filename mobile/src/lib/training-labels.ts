import type {
  RecordType,
  TrainingRecordedSet,
  TrainingTarget,
} from "../../../src/domain/training-metrics";
export function formatTrainingTarget(t: TrainingTarget): string {
  return [
    t.repsMin === null
      ? null
      : `${t.repsMin}${t.repsMax === t.repsMin ? "" : `–${t.repsMax}`} reps`,
    t.targetWeightKg === null ? null : `${t.targetWeightKg.toLocaleString("es-CL")} kg`,
    t.targetDurationSeconds === null ? null : `${t.targetDurationSeconds} s`,
    t.targetDistanceMeters === null ? null : `${t.targetDistanceMeters.toLocaleString("es-CL")} m`,
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
