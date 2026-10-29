import { describe, expect, it } from "vitest";
import {
  defaultPrescriptionInput,
  parsePrescriptionInput,
  prescriptionToInput,
} from "@/domain/prescription-input";
import { trainingTargetSummary, type RecordType } from "@/domain/training-metrics";
import {
  buildCoachBulkPreview,
  commonCoachFields,
  effectiveCoachGoals,
  prepareCoachRowChanges,
  type CoachPrescriptionRow,
  type CoachRowEdit,
} from "./typed-prescription";

const source = (
  kind: RecordType = "weight_reps",
  id = crypto.randomUUID(),
): CoachPrescriptionRow => ({
  id,
  exerciseId: crypto.randomUUID(),
  prescribed: parsePrescriptionInput(defaultPrescriptionInput(kind)),
  note: "Original",
  restSeconds: 90,
  supersetId: null,
  supersetRestSeconds: null,
});
function detailed() {
  const row = source("weight_duration");
  const series = [
    { ...row.prescribed.target, targetWeightKg: 20, targetDurationSeconds: 30 },
    { ...row.prescribed.target, targetWeightKg: 25.5, targetDurationSeconds: 45 },
  ];
  return {
    ...row,
    prescribed: { ...row.prescribed, sets: 2, series, target: trainingTargetSummary(series) },
  };
}
describe("T219 · entrada canónica de una fila del coach", () => {
  it("no prepara objetivos al modificar solo una indicación", () => {
    const row = source();
    expect(
      prepareCoachRowChanges(row, { id: row.id, exerciseId: row.exerciseId, note: "Otra" }),
    ).toEqual({ note: "Otra" });
    expect(
      prepareCoachRowChanges(row, { id: row.id, exerciseId: row.exerciseId, note: "" }),
    ).toEqual({ note: null });
  });
  it("mantiene texto incompleto sin normalizar hasta preparar", () => {
    const row = source("weight_distance");
    const input = defaultPrescriptionInput("weight_distance");
    input.target.targetDistanceMeters = "12,";
    const edit: CoachRowEdit = {
      id: row.id,
      exerciseId: row.exerciseId,
      targets: { kind: "replace", input },
    };
    expect(effectiveCoachGoals(row, edit)).toEqual(input);
    expect(() => prepareCoachRowChanges(row, edit)).toThrow();
    expect(edit.targets).toEqual({ kind: "replace", input });
  });
  it("una entrada completa conserva todas las dimensiones, detalle y cero explícito", () => {
    const row = detailed();
    const input = prescriptionToInput(row.prescribed);
    if (input.mode !== "series") throw Error("fixture");
    input.series[0].targetWeightKg = "0";
    expect(
      prepareCoachRowChanges(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        targets: { kind: "replace", input },
      }),
    ).toMatchObject({
      prescribed: {
        sets: 2,
        series: [
          { targetWeightKg: 0, targetDurationSeconds: 30 },
          { targetWeightKg: 25.5, targetDurationSeconds: 45 },
        ],
      },
    });
  });
  it("combina únicamente dimensiones explícitas sobre la versión revisada", () => {
    const row = detailed();
    const edit: CoachRowEdit = {
      id: row.id,
      exerciseId: row.exerciseId,
      targets: { kind: "patch", changes: { sets: 3, targetWeightKg: 0 } },
    };
    const goals = effectiveCoachGoals(row, edit);
    expect(goals.mode).toBe("series");
    expect(
      parsePrescriptionInput(goals).series?.map((t) => [t.targetWeightKg, t.targetDurationSeconds]),
    ).toEqual([
      [0, 30],
      [0, 45],
      [0, 45],
    ]);
    expect(prepareCoachRowChanges(row, edit)).toEqual({ sets: 3, targetWeightKg: 0 });
    expect(row.prescribed.sets).toBe(2);
  });
  it("rechaza identidad distinta, cambio de tipo o dimensiones inaplicables", () => {
    const row = source("duration");
    expect(() =>
      prepareCoachRowChanges(row, {
        id: crypto.randomUUID(),
        exerciseId: row.exerciseId,
        note: "x",
      }),
    ).toThrow();
    expect(() =>
      prepareCoachRowChanges(row, { id: row.id, exerciseId: crypto.randomUUID(), note: "x" }),
    ).toThrow();
    expect(() =>
      prepareCoachRowChanges(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        targets: { kind: "replace", input: defaultPrescriptionInput("weight_reps") },
      }),
    ).toThrow();
    expect(() =>
      effectiveCoachGoals(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        targets: { kind: "patch", changes: { targetWeightKg: null } },
      }),
    ).toThrow();
  });
  it("valida descansos y notas, sin borrar campos no elegidos", () => {
    const row = source();
    expect(
      prepareCoachRowChanges(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        restSeconds: "",
        supersetRestSeconds: "0",
      }),
    ).toEqual({ restSeconds: null, supersetRestSeconds: 0 });
    for (const restSeconds of ["1e2", "12,5", "14", "601", "-1"])
      expect(() =>
        prepareCoachRowChanges(row, { id: row.id, exerciseId: row.exerciseId, restSeconds }),
      ).toThrow();
    expect(() =>
      prepareCoachRowChanges(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        note: "x".repeat(501),
      }),
    ).toThrow();
    expect(
      prepareCoachRowChanges(row, {
        id: row.id,
        exerciseId: row.exerciseId,
        note: "💪".repeat(500),
      }),
    ).toHaveProperty("note");
  });
  it("rechaza fuentes dobles, campos desconocidos y cambios vacíos", () => {
    const row = source(),
      base = { id: row.id, exerciseId: row.exerciseId };
    for (const edit of [
      base,
      { ...base, unknown: 1 },
      { ...base, note: undefined },
      { ...base, targets: { kind: "patch", changes: {} } },
      { ...base, targets: { kind: "patch", changes: { note: "x" } } },
      {
        ...base,
        targets: { kind: "replace", input: defaultPrescriptionInput(null), changes: { sets: 3 } },
      },
    ])
      expect(() => prepareCoachRowChanges(row, edit)).toThrow();
  });
});

describe("T219 · edición múltiple de dimensiones comunes", () => {
  it("ofrece solo dimensiones comunes, sin inferir desde nombres o equipo", () => {
    expect(commonCoachFields([source("weight_duration"), source("distance_duration")])).toEqual([
      "sets",
      "targetDurationSeconds",
    ]);
    expect(commonCoachFields([source("duration"), source("weight_reps")])).toEqual(["sets"]);
    expect(commonCoachFields([source(null), source("weighted_bodyweight")])).toEqual([
      "sets",
      "repsMin",
      "repsMax",
      "targetWeightKg",
    ]);
    expect(commonCoachFields([])).toEqual([]);
  });
  it("aplica el lote completo preservando indicaciones y diferencias no seleccionadas", () => {
    const rows = [detailed(), source("weight_duration")];
    const result = buildCoachBulkPreview(rows, {
      ids: rows.map((r) => r.id),
      fields: { sets: "3", targetWeightKg: "12,35" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    expect(result.rows[0].changes).toEqual({ sets: 3, targetWeightKg: 12.35 });
    expect(result.rows[0].prescribed.series?.map((t) => t.targetDurationSeconds)).toEqual([
      30, 45, 45,
    ]);
    expect(result.rows[1].prescribed.target.targetDurationSeconds).toBeNull();
    expect(result.rows[0].changes).not.toHaveProperty("note");
  });
  it("rechaza el lote si cualquier selección/campo/valor es inválido", () => {
    const rows = [source("duration"), source("weight_reps")];
    for (const draft of [
      { ids: [], fields: { sets: "3" } },
      { ids: [rows[0].id, rows[0].id], fields: { sets: "3" } },
      { ids: [crypto.randomUUID()], fields: { sets: "3" } },
      { ids: rows.map((r) => r.id), fields: { targetDurationSeconds: "30" } },
      { ids: rows.map((r) => r.id), fields: { sets: "" } },
      { ids: rows.map((r) => r.id), fields: {} },
      { ids: [rows[0].id], fields: { sets: "1e1" } },
      { ids: [rows[0].id], fields: { note: "x" } },
    ])
      expect(buildCoachBulkPreview(rows, draft).ok).toBe(false);
  });
  it("conserva cero/vacío y exige todos los integrantes para descanso de ronda", () => {
    const group = crypto.randomUUID();
    const rows = [
      { ...source("duration"), supersetId: group, supersetRestSeconds: 90 },
      { ...source("duration"), supersetId: group, supersetRestSeconds: 90 },
      source("duration"),
    ];
    expect(
      buildCoachBulkPreview(rows, { ids: [rows[0].id], fields: { restSeconds: "120" } }).ok,
    ).toBe(false);
    const result = buildCoachBulkPreview(rows, {
      ids: rows.map((r) => r.id),
      fields: { restSeconds: "0", targetDurationSeconds: "" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    expect(result.rows.map((r) => r.changes)).toEqual([
      { supersetRestSeconds: 0, targetDurationSeconds: null },
      { supersetRestSeconds: 0, targetDurationSeconds: null },
      { restSeconds: 0, targetDurationSeconds: null },
    ]);
    expect(
      buildCoachBulkPreview(rows, { ids: [rows[2].id], fields: { restSeconds: "14" } }).ok,
    ).toBe(false);
  });
  it("no degrada una serie de tiempo a repeticiones cuando cambia su cantidad", () => {
    const row = detailed();
    const result = buildCoachBulkPreview([row], { ids: [row.id], fields: { sets: "1" } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    expect(result.rows[0].prescribed).toMatchObject({
      sets: 1,
      series: [{ repsMin: null, repsMax: null, targetDurationSeconds: 30 }],
    });
  });
});
