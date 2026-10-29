import { describe, expect, it } from "vitest";
import {
  coachSessionRequestSchema,
  coachSessionResultSchema,
  applyCoachPrescriptionChanges,
} from "./coach-session-mutation";
import { defaultPrescriptionInput, parsePrescriptionInput } from "./prescription-input";
import { RECORD_TYPES, trainingTargetSummary, type TrainingPrescription } from "./training-metrics";

const id = (n: number) => `af219300-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = (operation: string, data: unknown) => ({
  version: 2,
  id: id(1),
  revision: 3,
  operation,
  data,
});
const rx = (kind: Parameters<typeof defaultPrescriptionInput>[0]) =>
  parsePrescriptionInput(defaultPrescriptionInput(kind));
const row = (changes: unknown) => ({ id: id(2), exerciseId: id(3), changes });
describe("contrato cerrado de operaciones del coach", () => {
  it.each([
    ["add", { items: [{ id: id(2), exerciseId: id(3) }] }],
    [
      "prescribe",
      { rows: [row({ prescribed: rx("duration"), note: null })], title: "A", weekday: -1 },
    ],
    ["prescribe", { rows: [], title: "" }],
    ["prescribe", { rows: [], weekday: 0 }],
    [
      "alternatives",
      { rowId: id(2), alternatives: [{ exerciseId: id(3), prescribed: rx("weight_distance") }] },
    ],
    ["alternatives", { rowId: id(2), alternatives: [] }],
    ["order", { ids: [id(2), id(3)] }],
    [
      "layout",
      { items: [{ id: id(2), restSeconds: 0, supersetId: null, supersetRestSeconds: null }] },
    ],
    ["remove", { rowId: id(2) }],
    ["duplicate", { copyId: id(4), rowId: id(2) }],
    ["duplicate", { copyId: id(4), rowId: null }],
  ])("acepta %s con contenido explícito", (operation, data) => {
    expect(coachSessionRequestSchema.parse(request(operation as string, data))).toEqual(
      request(operation as string, data),
    );
  });
  it.each([
    request("unknown", {}),
    { ...request("remove", { rowId: id(2) }), version: 1 },
    { ...request("remove", { rowId: id(2) }), revision: 2.5 },
    { ...request("remove", { rowId: id(2) }), revision: 2147483648 },
    { ...request("remove", { rowId: id(2) }), userId: id(9) },
    request("remove", { rowId: id(2), extra: true }),
    request("prescribe", { rows: [] }),
    request("prescribe", { rows: [row({})] }),
    request("prescribe", { rows: [row({ sets: "3" })] }),
    request("prescribe", { rows: [row({ prescribed: rx(null), sets: 3 })] }),
    request("prescribe", { rows: [row({ sets: undefined })] }),
    request("prescribe", { rows: [row({ exerciseId: id(4) })] }),
    request("prescribe", { rows: [row({ targetWeightKg: 12.351 })] }),
    request("prescribe", { rows: [row({ repsMin: null })] }),
    request("prescribe", { rows: [row({ restSeconds: 1 })] }),
    request("prescribe", { rows: [row({ note: "a".repeat(501) })] }),
    request("add", {
      items: [
        { id: id(2), exerciseId: id(3) },
        { id: id(2), exerciseId: id(4) },
      ],
    }),
    request("add", {
      items: [
        { id: id(2), exerciseId: id(3) },
        { id: id(4), exerciseId: id(3) },
      ],
    }),
    request("prescribe", { rows: [row({ note: null }), row({ note: "Otra" })] }),
    request("order", { ids: [id(2), id(2).toUpperCase()] }),
    request("alternatives", {
      rowId: id(2),
      alternatives: [
        { exerciseId: id(3), prescribed: rx(null) },
        { exerciseId: id(3).toUpperCase(), prescribed: rx(null) },
      ],
    }),
    request("duplicate", { copyId: id(2) }),
  ])("rechaza campos ajenos, ambiguos o inválidos %#", (value) => {
    expect(coachSessionRequestSchema.safeParse(value).success).toBe(false);
  });
  it("valida grupos completos, consecutivos y descansos iguales", () => {
    const a = { id: id(2), restSeconds: null, supersetId: id(10), supersetRestSeconds: 60 };
    const b = { ...a, id: id(3) };
    expect(coachSessionRequestSchema.safeParse(request("layout", { items: [a, b] })).success).toBe(
      true,
    );
    for (const items of [
      [a],
      [a, { ...b, supersetRestSeconds: 90 }],
      [a, { ...b, supersetId: null, supersetRestSeconds: null }, { ...a, id: id(4) }],
      [a, b, { ...a, id: id(4) }, { ...a, id: id(5) }, { ...a, id: id(6) }],
      [{ ...a, supersetId: null }],
      [a, a],
    ])
      expect(coachSessionRequestSchema.safeParse(request("layout", { items })).success).toBe(false);
  });
  it("no cuenta pares UTF16 como dos caracteres de la nota", () => {
    expect(
      coachSessionRequestSchema.safeParse(
        request("prescribe", { rows: [row({ note: "💪".repeat(500) })] }),
      ).success,
    ).toBe(true);
    expect(
      coachSessionRequestSchema.safeParse(
        request("prescribe", { rows: [], title: "💪".repeat(80) }),
      ).success,
    ).toBe(true);
    expect(
      coachSessionRequestSchema.safeParse(
        request("prescribe", { rows: [], title: "💪".repeat(81) }),
      ).success,
    ).toBe(false);
  });
  it("valida confirmación y copia sin campos de otra versión", () => {
    const result = { version: 2, id: id(1), sessionId: id(2), revision: 5, status: "applied" };
    expect(coachSessionResultSchema.parse(result)).toEqual(result);
    for (const status of ["duplicate", "removed"])
      expect(coachSessionResultSchema.safeParse({ ...result, status }).success).toBe(true);
    expect(
      coachSessionResultSchema.safeParse({ ...result, copyId: id(4), copyKind: "exercise" })
        .success,
    ).toBe(true);
    expect(coachSessionResultSchema.safeParse({ ...result, copyId: id(4) }).success).toBe(false);
    expect(coachSessionResultSchema.safeParse({ ...result, copyKind: "session" }).success).toBe(
      false,
    );
    expect(coachSessionResultSchema.safeParse({ ...result, extra: true }).success).toBe(false);
  });
});

describe("parche de prescripción por campos elegidos", () => {
  it.each([null, ...RECORD_TYPES])("preserva tipo %s, sin usar notas como objetivo", (kind) => {
    const current = rx(kind);
    expect(
      applyCoachPrescriptionChanges(current, { sets: 4, note: "Nota", restSeconds: 90 }),
    ).toEqual({ ...current, sets: 4 });
    expect(current.sets).toBe(3);
  });
  it("aplica peso cero y conserva los rangos distintos al ampliar series", () => {
    const current = rx("weight_reps");
    const series = [
      { ...current.target, repsMin: 6, repsMax: 8, targetWeightKg: 80 },
      { ...current.target, repsMin: 10, repsMax: 12, targetWeightKg: 70 },
    ];
    const source: TrainingPrescription = {
      ...current,
      sets: 2,
      series,
      target: trainingTargetSummary(series),
    };
    const changed = applyCoachPrescriptionChanges(source, { sets: 3, targetWeightKg: 0 });
    expect(changed.series).toEqual([
      { ...series[0], targetWeightKg: 0 },
      { ...series[1], targetWeightKg: 0 },
      { ...series[1], targetWeightKg: 0 },
    ]);
    expect(changed.target).toEqual({ ...source.target, targetWeightKg: 0 });
    expect(source.series?.[0].targetWeightKg).toBe(80);
    expect(applyCoachPrescriptionChanges(source, { sets: 1 }).target).toEqual(series[0]);
  });
  it("preserva segundos al cambiar metros y suprime solo el objetivo elegido", () => {
    const source = rx("distance_duration");
    source.target.targetDurationSeconds = 60;
    source.target.targetDistanceMeters = 200;
    expect(applyCoachPrescriptionChanges(source, { targetDistanceMeters: null }).target).toEqual({
      ...source.target,
      targetDistanceMeters: null,
    });
    expect(
      applyCoachPrescriptionChanges(source, { targetDurationSeconds: 90 }).target
        .targetDistanceMeters,
    ).toBe(200);
  });
  it("permite un objetivo completo del mismo tipo, conservando su modo por serie", () => {
    const source = rx("duration");
    const replacement = { ...source, series: [source.target, source.target, source.target] };
    expect(applyCoachPrescriptionChanges(source, { prescribed: replacement })).toEqual(replacement);
    expect(() =>
      applyCoachPrescriptionChanges(source, { prescribed: rx("weight_duration") }),
    ).toThrow();
  });
  it("rechaza dimensiones inaplicables incluso al intentar limpiarlas", () => {
    expect(() =>
      applyCoachPrescriptionChanges(rx("bodyweight_reps"), { targetWeightKg: null }),
    ).toThrow();
    expect(() => applyCoachPrescriptionChanges(rx("duration"), { repsMin: 8 })).toThrow();
    expect(() =>
      applyCoachPrescriptionChanges(rx("weight_reps"), { targetDurationSeconds: null }),
    ).toThrow();
    expect(() =>
      applyCoachPrescriptionChanges(rx("duration"), { targetDistanceMeters: null }),
    ).toThrow();
  });
  it("no intercambia automáticamente rangos incompatibles", () => {
    expect(() => applyCoachPrescriptionChanges(rx(null), { repsMin: 20 })).toThrow();
  });
});
