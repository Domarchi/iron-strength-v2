import { expect, it } from "vitest";
import {
  personalExerciseFieldsSchema,
  personalExerciseMutationSchema,
  personalExerciseLibrarySchema,
} from "./personal-exercise-contracts";
import { RECORD_TYPES } from "../../domain/training-metrics";
const id = "a0000000-0000-4000-8000-000000000001";
const fields = {
  name: "  Mi ejercicio  ",
  muscleGroup: "Core",
  equipment: null,
  isBodyweight: true,
  progressionIncrementKg: 2.5,
  recordType: "duration",
};
it("valida los ocho tipos y legado explícito, sin inferir dimensiones", () => {
  for (const recordType of [null, ...RECORD_TYPES])
    expect(personalExerciseFieldsSchema.parse({ ...fields, recordType })).toMatchObject({
      name: "Mi ejercicio",
      recordType,
    });
  for (const patch of [
    { name: " " },
    { name: "a".repeat(101) },
    { equipment: " " },
    { equipment: "a".repeat(51) },
    { muscleGroup: "Inventado" },
    { progressionIncrementKg: 0 },
    { progressionIncrementKg: 20.01 },
    { progressionIncrementKg: 0.001 },
    { recordType: "reps" },
    { ownerId: id },
    { recordType: undefined },
  ])
    expect(personalExerciseFieldsSchema.safeParse({ ...fields, ...patch }).success).toBe(false);
});
it("intentos cerrados, revisión cero solo al crear, archivado no acepta datos ocultos", () => {
  const input = {
    version: 1,
    requestId: id,
    targetId: id,
    expectedRevision: 0,
    operation: "create",
    data: fields,
  };
  expect(personalExerciseMutationSchema.safeParse(input).success).toBe(true);
  for (const patch of [
    { version: 2 },
    { expectedRevision: 1 },
    { userId: id },
    { requestId: "bad" },
  ])
    expect(personalExerciseMutationSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  expect(
    personalExerciseMutationSchema.safeParse({ ...input, operation: "update", expectedRevision: 1 })
      .success,
  ).toBe(true);
  for (const operation of ["archive", "restore"])
    for (const data of [{}, fields])
      expect(
        personalExerciseMutationSchema.safeParse({ ...input, operation, expectedRevision: 1, data })
          .success,
      ).toBe(Object.keys(data).length === 0);
});
it("snapshot de gestión conserva cuenta, archivados y revisión; rechaza duplicados o futuro", () => {
  const row = { ...fields, name: "Mi ejercicio", id, revision: 1, archivedAt: null };
  const snapshot = { version: 1, userId: id, exercises: [row] };
  expect(personalExerciseLibrarySchema.parse(snapshot).exercises[0]).toEqual(row);
  for (const patch of [
    { version: 2 },
    { exercises: [row, row] },
    { exercises: [{ ...row, revision: 0 }] },
    { exercises: [{ ...row, ownerId: id }] },
  ])
    expect(personalExerciseLibrarySchema.safeParse({ ...snapshot, ...patch }).success).toBe(false);
});
