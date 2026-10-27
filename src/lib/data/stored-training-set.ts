import { legacyTrainingSet, trainingRecordedSetSchema } from "../../domain/training-metrics";
type StoredValues = {
  weight_kg: number | string | null;
  reps: number | null;
  is_warmup: boolean;
  record_type?: string | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  set_type?: string | null;
  effort?: number | null;
};
/** A projection for repetition-based legacy consumers, never seconds or assistance as load. */
export function repetitionValues(row: Pick<StoredValues, "weight_kg" | "reps" | "record_type">) {
  if (row.reps === null || row.weight_kg === null || row.record_type != null)
    throw Error("Este registro requiere la vista de métricas avanzadas.");
  return { weightKg: Number(row.weight_kg), reps: row.reps };
}
export function storedTrainingSet(row: StoredValues) {
  if (row.set_type == null) {
    if (
      row.record_type != null ||
      row.duration_seconds != null ||
      row.distance_meters != null ||
      row.effort != null
    )
      throw Error("Registro anterior incompatible.");
    return legacyTrainingSet({ ...repetitionValues(row), isWarmup: row.is_warmup });
  }
  return trainingRecordedSetSchema.parse({
    recordType: row.record_type,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    setType: row.set_type,
    effort: row.effort,
  });
}
