import { expect, it } from "vitest";
import {
  workoutRemovalSchema,
  workoutRemovalSnapshotSchema,
  workoutRemovalReceiptSchema,
} from "./workout-removal-contracts";
const id = "af214a00-0000-4000-8000-000000000002",
  requestId = "af214a00-0000-4000-8000-000000000005";
const input = { version: 1, requestId, workoutId: id, expectedRevision: 3 };
it("petición cerrada normaliza identidades sin aceptar propietario o confirmación del cliente", () => {
  expect(workoutRemovalSchema.parse({ ...input, workoutId: id.toUpperCase() })).toEqual(input);
  for (const extra of [
    { ownerId: id },
    { confirmed: true },
    { note: "x" },
    { operation: "correct" },
  ])
    expect(workoutRemovalSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
it("valida revisión entera y UUID sin interpretar texto o valores fuera de rango", () => {
  for (const value of [-1, 1.5, 2147483648, "3", NaN])
    expect(workoutRemovalSchema.safeParse({ ...input, expectedRevision: value }).success).toBe(
      false,
    );
  expect(workoutRemovalSchema.safeParse({ ...input, requestId: "invalid" }).success).toBe(false);
});
it("instantánea propia admite cero o más de300series y cuenta comentarios completos", () => {
  const snapshot = {
    version: 1,
    userId: requestId,
    today: "2026-10-28",
    workout: {
      id,
      revision: 0,
      sourceKind: "free",
      title: "Mi entrenamiento",
      sessionLabel: null,
      performedOn: "2026-10-27",
      setCount: 301,
      commentCount: 1200,
    },
  };
  expect(workoutRemovalSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  expect(
    workoutRemovalSnapshotSchema.safeParse({
      ...snapshot,
      workout: { ...snapshot.workout, setCount: 0 },
    }).success,
  ).toBe(true);
  expect(
    workoutRemovalSnapshotSchema.safeParse({
      ...snapshot,
      workout: { ...snapshot.workout, commentCount: -1 },
    }).success,
  ).toBe(false);
  expect(
    workoutRemovalSnapshotSchema.safeParse({ ...snapshot, ownerEmail: "private" }).success,
  ).toBe(false);
});
it("el recibo no se confunde con una corrección o cierre", () => {
  for (const status of ["deleted", "duplicate"])
    expect(
      workoutRemovalReceiptSchema.safeParse({
        version: 1,
        requestId,
        workoutId: id,
        revision: 4,
        status,
      }).success,
    ).toBe(true);
  for (const status of ["updated", "removed", "saved"])
    expect(
      workoutRemovalReceiptSchema.safeParse({
        version: 1,
        requestId,
        workoutId: id,
        revision: 4,
        status,
      }).success,
    ).toBe(false);
});
