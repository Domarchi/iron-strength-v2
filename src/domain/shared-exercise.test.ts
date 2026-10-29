import { expect, it } from "vitest";
import {
  sharedExerciseCreateSchema,
  sharedExerciseUpdateSchema,
  sharedExerciseRecordLabel,
} from "./shared-exercise";
import { RECORD_TYPES } from "./training-metrics";
const base = {
  name: "Plancha",
  muscleGroup: "Core",
  equipment: "Peso corporal",
  progressionIncrementKg: "2,5",
};
it.each([null, ...RECORD_TYPES])(
  "conserva explícitamente el tipo %s sin inferirlo del equipamiento",
  (recordType) => {
    expect(sharedExerciseCreateSchema.parse({ ...base, recordType })).toMatchObject({
      recordType,
      progressionIncrementKg: 2.5,
    });
    expect(sharedExerciseRecordLabel(recordType).length).toBeGreaterThan(0);
  },
);
it("las llamadas antiguas conservan el contrato null sin afectar la selección explícita", () => {
  expect(sharedExerciseCreateSchema.parse(base).recordType).toBeNull();
  expect(sharedExerciseCreateSchema.safeParse({ ...base, recordType: "future" }).success).toBe(
    false,
  );
  expect(sharedExerciseCreateSchema.safeParse({ ...base, recordType: undefined }).success).toBe(
    false,
  );
  expect(sharedExerciseCreateSchema.safeParse({ ...base, recordType: "" }).success).toBe(false);
  expect(
    sharedExerciseCreateSchema.safeParse({ ...base, personalOwnerId: crypto.randomUUID() }).success,
  ).toBe(false);
});
it("editar metadatos no acepta otro tipo ni campos de propiedad", () => {
  expect(sharedExerciseUpdateSchema.parse(base)).toMatchObject({ name: "Plancha" });
  for (const extra of [
    { recordType: "duration" },
    { recordType: null },
    { coachId: crypto.randomUUID() },
  ])
    expect(sharedExerciseUpdateSchema.safeParse({ ...base, ...extra }).success).toBe(false);
});
it("rechaza incrementos que el almacenamiento redondearía", () => {
  for (const schema of [sharedExerciseCreateSchema, sharedExerciseUpdateSchema]) {
    expect(schema.safeParse({ ...base, progressionIncrementKg: "0,001" }).success).toBe(false);
    expect(schema.safeParse({ ...base, progressionIncrementKg: "1,234" }).success).toBe(false);
    expect(schema.safeParse({ ...base, progressionIncrementKg: "0,25" }).success).toBe(true);
  }
});
