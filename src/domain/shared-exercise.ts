import { hasAtMostDecimals } from "./numbers";
import { exerciseInputSchema } from "./schemas";
import { recordTypeSchema, type RecordType } from "./training-metrics";

const validIncrement = (value: { progressionIncrementKg: number }) =>
  hasAtMostDecimals(2)(value.progressionIncrementKg);
export const sharedExerciseUpdateSchema = exerciseInputSchema
  .strict()
  .refine(validIncrement, "Usa hasta dos decimales en el incremento.");
export const sharedExerciseCreateSchema = exerciseInputSchema
  .extend({ recordType: recordTypeSchema.optional() })
  .strict()
  .refine(validIncrement, "Usa hasta dos decimales en el incremento.")
  .superRefine((value, context) => {
    if (Object.hasOwn(value, "recordType") && value.recordType === undefined)
      context.addIssue({
        code: "custom",
        path: ["recordType"],
        message: "Elige un tipo de registro.",
      });
  })
  .transform((value) => ({ ...value, recordType: value.recordType ?? null }));
const labels: Record<NonNullable<RecordType>, string> = {
  weight_reps: "Peso y repeticiones",
  bodyweight_reps: "Peso corporal",
  weighted_bodyweight: "Peso corporal con carga",
  assisted_bodyweight: "Peso corporal asistido",
  duration: "Tiempo",
  weight_duration: "Peso y tiempo",
  distance_duration: "Distancia y tiempo",
  weight_distance: "Peso y distancia",
};
export function sharedExerciseRecordLabel(recordType: RecordType): string {
  return labels[recordType ?? "weight_reps"];
}
