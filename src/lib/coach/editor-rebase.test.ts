import { expect, it } from "vitest";
import {
  defaultPrescriptionInput,
  parsePrescriptionInput,
  prescriptionToInput,
} from "@/domain/prescription-input";
import { trainingTargetSummary } from "@/domain/training-metrics";
import { mergeCoachRowEdit } from "./editor-rebase";
import {
  effectiveCoachGoals,
  type CoachPrescriptionRow,
  type CoachRowEdit,
} from "./typed-prescription";
function row(): CoachPrescriptionRow {
  return {
    id: crypto.randomUUID(),
    exerciseId: crypto.randomUUID(),
    prescribed: parsePrescriptionInput(defaultPrescriptionInput("weight_duration")),
    note: null,
    restSeconds: 90,
    supersetId: null,
    supersetRestSeconds: null,
  };
}
it("combina campos uniformes elegidos con dimensiones nuevas del servidor, conservando texto parcial", () => {
  const base = row(),
    input = prescriptionToInput(base.prescribed);
  if (input.mode !== "uniform") throw Error("fixture");
  input.target.targetWeightKg = "12,";
  const current = {
    ...base,
    prescribed: {
      ...base.prescribed,
      target: { ...base.prescribed.target, targetDurationSeconds: 45 },
    },
  };
  const result = mergeCoachRowEdit(base, current, {
    id: base.id,
    exerciseId: base.exerciseId,
    targets: { kind: "replace", input },
    note: "Local",
  });
  expect(effectiveCoachGoals(current, result)).toMatchObject({
    target: { targetWeightKg: "12,", targetDurationSeconds: "45" },
  });
  expect(result.note).toBe("Local");
});
it("preserva diferencias por serie del servidor al aplicar un cambio uniforme parcial", () => {
  const base = row(),
    input = prescriptionToInput(base.prescribed);
  if (input.mode !== "uniform") throw Error("fixture");
  input.target.targetWeightKg = "0";
  const series = [
    { ...base.prescribed.target, targetDurationSeconds: 30 },
    { ...base.prescribed.target, targetDurationSeconds: 45 },
  ];
  const current = {
    ...base,
    prescribed: { ...base.prescribed, sets: 2, series, target: trainingTargetSummary(series) },
  };
  const result = mergeCoachRowEdit(base, current, {
    id: base.id,
    exerciseId: base.exerciseId,
    targets: { kind: "replace", input },
  });
  expect(
    parsePrescriptionInput(effectiveCoachGoals(current, result)).series?.map((t) => [
      t.targetWeightKg,
      t.targetDurationSeconds,
    ]),
  ).toEqual([
    [0, 30],
    [0, 45],
  ]);
});
it("combina cada serie por índice y conserva las cantidades no elegidas", () => {
  const base = row(),
    series = [
      { ...base.prescribed.target, targetDurationSeconds: 30 },
      { ...base.prescribed.target, targetDurationSeconds: 45 },
    ];
  base.prescribed = { ...base.prescribed, sets: 2, series, target: trainingTargetSummary(series) };
  const input = prescriptionToInput(base.prescribed);
  if (input.mode !== "series") throw Error("fixture");
  input.series[0].targetWeightKg = "20,5";
  const newer = [
    { ...series[0], targetDurationSeconds: 60 },
    { ...series[1], targetDurationSeconds: 90 },
    { ...series[1], targetDurationSeconds: 120 },
  ];
  const current = {
    ...base,
    prescribed: {
      ...base.prescribed,
      sets: 3,
      series: newer,
      target: trainingTargetSummary(newer),
    },
  };
  const edit = mergeCoachRowEdit(base, current, {
    id: base.id,
    exerciseId: base.exerciseId,
    targets: { kind: "replace", input },
  });
  expect(
    parsePrescriptionInput(effectiveCoachGoals(current, edit)).series?.map((t) => [
      t.targetWeightKg,
      t.targetDurationSeconds,
    ]),
  ).toEqual([
    [20.5, 60],
    [null, 90],
    [null, 120],
  ]);
});
it("redimensionar replica el objetivo actual no elegido y conserva las ediciones locales", () => {
  const base = row(),
    input = prescriptionToInput(base.prescribed);
  if (input.mode !== "uniform") throw Error("fixture");
  input.sets = "4";
  const current = {
    ...base,
    prescribed: {
      ...base.prescribed,
      sets: 2,
      target: { ...base.prescribed.target, targetDurationSeconds: 90 },
    },
  };
  const edit = mergeCoachRowEdit(base, current, {
    id: base.id,
    exerciseId: base.exerciseId,
    targets: { kind: "replace", input },
  });
  expect(effectiveCoachGoals(current, edit)).toMatchObject({
    sets: "4",
    target: { targetDurationSeconds: "90" },
  });
});
it("un parche explícito ya conserva lo no seleccionado y no cambia su forma", () => {
  const base = row(),
    edit: CoachRowEdit = {
      id: base.id,
      exerciseId: base.exerciseId,
      targets: { kind: "patch", changes: { targetWeightKg: 0 } },
      restSeconds: "120",
    };
  expect(mergeCoachRowEdit(base, base, edit)).toEqual(edit);
});
it("una conversión explícita de modo conserva su propuesta completa para la revisión", () => {
  const base = row(),
    input = prescriptionToInput(base.prescribed);
  if (input.mode !== "uniform") throw Error("fixture");
  const proposed = {
    mode: "series" as const,
    recordType: input.recordType,
    series: [{ ...input.target, targetDurationSeconds: "30" }],
  };
  expect(
    mergeCoachRowEdit(base, base, {
      id: base.id,
      exerciseId: base.exerciseId,
      targets: { kind: "replace", input: proposed },
    }).targets,
  ).toEqual({ kind: "replace", input: proposed });
});
it("una fila retirada, un tipo distinto o cantidad incompleta no se aplican a ciegas", () => {
  const base = row(),
    input = prescriptionToInput(base.prescribed);
  if (input.mode !== "uniform") throw Error("fixture");
  input.sets = "";
  const series = [{ ...base.prescribed.target, targetDurationSeconds: 30 }];
  const current = {
    ...base,
    prescribed: { ...base.prescribed, sets: 1, series, target: trainingTargetSummary(series) },
  };
  const edit: CoachRowEdit = {
    id: base.id,
    exerciseId: base.exerciseId,
    targets: { kind: "replace", input },
  };
  expect(() => mergeCoachRowEdit(base, current, edit)).toThrow("cantidad");
  expect(() =>
    mergeCoachRowEdit(base, { ...current, exerciseId: crypto.randomUUID() }, edit),
  ).toThrow();
  expect(() =>
    mergeCoachRowEdit(
      base,
      { ...current, prescribed: parsePrescriptionInput(defaultPrescriptionInput("duration")) },
      edit,
    ),
  ).toThrow();
});
