import {
  prescribedSeriesSchema,
  seriesTargetSchema,
  type SeriesPrescription,
} from "./prescription-series";
import { trainingPrescriptionSchema, type TrainingPrescription } from "./training-metrics";

type StoredPrescription = {
  sets: unknown;
  reps_min: unknown;
  reps_max: unknown;
  target_weight_kg: unknown;
  prescription_sets?: unknown;
  typed_prescription?: unknown;
};

/** Decode the stored format without using current exercise metadata or coercing nulls. */
export function readStoredTrainingPrescription(row: StoredPrescription): TrainingPrescription {
  if (row.typed_prescription != null) {
    const prescribed = trainingPrescriptionSchema.parse(row.typed_prescription);
    if (
      row.sets !== prescribed.sets ||
      row.reps_min !== null ||
      row.reps_max !== null ||
      row.target_weight_kg !== null ||
      row.prescription_sets != null
    )
      throw new Error("La prescripción tiene fuentes de objetivos incompatibles.");
    return prescribed;
  }
  const series =
    row.prescription_sets == null ? null : prescribedSeriesSchema.parse(row.prescription_sets);
  return trainingPrescriptionSchema.parse({
    recordType: null,
    sets: row.sets,
    target: {
      repsMin: row.reps_min,
      repsMax: row.reps_max,
      targetWeightKg: row.target_weight_kg,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
    },
    series:
      series?.map((target) => ({
        ...target,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      })) ?? null,
  });
}

/** An old consumer must fail explicitly; it cannot project modern targets to fake reps. */
export function readLegacyRoutinePrescription(row: StoredPrescription): SeriesPrescription {
  if (row.typed_prescription != null)
    throw new Error("La prescripción requiere el formato de entrenamiento actualizado.");
  const prescribed = readStoredTrainingPrescription(row);
  return {
    sets: prescribed.sets,
    ...seriesTargetSchema.parse({
      repsMin: prescribed.target.repsMin,
      repsMax: prescribed.target.repsMax,
      targetWeightKg: prescribed.target.targetWeightKg,
    }),
    ...(row.prescription_sets != null
      ? { series: prescribedSeriesSchema.parse(row.prescription_sets) }
      : {}),
  };
}

/** Transitional v1 context: only the explicit legacy kind has identical recording semantics. */
export function readRepetitionContextPrescription(row: StoredPrescription): SeriesPrescription {
  if (row.typed_prescription == null) return readLegacyRoutinePrescription(row);
  const prescribed = readStoredTrainingPrescription(row);
  if (prescribed.recordType !== null)
    throw Error("Esta rutina requiere el contexto de entrenamiento tipado.");
  const target = (value: TrainingPrescription["target"]) =>
    seriesTargetSchema.parse({
      repsMin: value.repsMin,
      repsMax: value.repsMax,
      targetWeightKg: value.targetWeightKg,
    });
  return {
    sets: prescribed.sets,
    ...target(prescribed.target),
    ...(prescribed.series ? { series: prescribed.series.map(target) } : {}),
  };
}
