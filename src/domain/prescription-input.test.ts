import { expect, it } from "vitest";
import { trainingMetricCases } from "../test/fixtures/training-metrics";
import { trainingPrescriptionSchema } from "./training-metrics";
import {
  defaultPrescriptionInput,
  parsePrescriptionInput,
  prescriptionInputFields,
  prescriptionInputSchema,
  prescriptionToInput,
} from "./prescription-input";

for (const metrics of trainingMetricCases) {
  it(`objetivos uniformes mantienen ${metrics.recordType ?? "legado null"} sin dimensiones ficticias`, () => {
    const prescribed = trainingPrescriptionSchema.parse({
      recordType: metrics.recordType,
      sets: 3,
      target: {
        repsMin: metrics.reps === null ? null : 8,
        repsMax: metrics.reps === null ? null : 12,
        targetWeightKg: metrics.weightKg,
        targetDurationSeconds: metrics.durationSeconds,
        targetDistanceMeters: metrics.distanceMeters,
      },
      series: null,
    });
    const draft = prescriptionToInput(prescribed);
    expect(draft.mode).toBe("uniform");
    expect(parsePrescriptionInput(draft)).toEqual(prescribed);
    const initial = parsePrescriptionInput(defaultPrescriptionInput(metrics.recordType));
    expect(initial).toEqual({
      recordType: metrics.recordType,
      sets: 3,
      target: {
        repsMin: metrics.reps === null ? null : 8,
        repsMax: metrics.reps === null ? null : 12,
        targetWeightKg: null,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      },
      series: null,
    });
    expect(prescriptionInputFields(metrics.recordType).includes("repsMin")).toBe(
      metrics.reps !== null,
    );
  });
}
for (const metrics of trainingMetricCases) {
  it(`detalle por serie mantiene ${metrics.recordType ?? "legado null"} y deriva su resumen`, () => {
    const first = {
      repsMin: metrics.reps === null ? null : 8,
      repsMax: metrics.reps === null ? null : 10,
      targetWeightKg: metrics.weightKg,
      targetDurationSeconds: metrics.durationSeconds,
      targetDistanceMeters: metrics.distanceMeters,
    };
    const last = {
      repsMin: metrics.reps === null ? null : 12,
      repsMax: metrics.reps === null ? null : 15,
      targetWeightKg: metrics.weightKg === null ? null : metrics.weightKg + 1.25,
      targetDurationSeconds: metrics.durationSeconds === null ? null : metrics.durationSeconds + 15,
      targetDistanceMeters: metrics.distanceMeters === null ? null : metrics.distanceMeters + 0.25,
    };
    const expected = trainingPrescriptionSchema.parse({
      recordType: metrics.recordType,
      sets: 2,
      target: {
        repsMin: metrics.reps === null ? null : 8,
        repsMax: metrics.reps === null ? null : 15,
        targetWeightKg: null,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      },
      series: [first, last],
    });
    const before = structuredClone(expected);
    const raw = prescriptionToInput(expected);
    expect(raw.mode).toBe("series");
    expect(parsePrescriptionInput(raw)).toEqual(expected);
    expect(expected).toEqual(before);
  });
}
it("límites exactos válidos mantienen valores canónicos y objetivos opcionales", () => {
  const one = defaultPrescriptionInput("weight_reps");
  expect(
    parsePrescriptionInput({
      ...one,
      sets: "10",
      target: { ...one.target, repsMin: "100", repsMax: "100", targetWeightKg: "500" },
    }),
  ).toMatchObject({ sets: 10, target: { repsMin: 100, repsMax: 100, targetWeightKg: 500 } });
  const timed = defaultPrescriptionInput("distance_duration");
  expect(
    parsePrescriptionInput({
      ...timed,
      target: { ...timed.target, targetDurationSeconds: "86400", targetDistanceMeters: "1000000" },
    }).target,
  ).toMatchObject({ targetDurationSeconds: 86400, targetDistanceMeters: 1000000 });
});
it("detalle por serie deriva cantidad/resumen y conserva diferencias sin campos comunes ocultos", () => {
  const one = defaultPrescriptionInput("weight_duration");
  if (one.mode !== "uniform") throw Error("fixture");
  const draft = {
    mode: "series" as const,
    recordType: "weight_duration" as const,
    series: [
      { ...one.target, targetWeightKg: "20", targetDurationSeconds: "60" },
      { ...one.target, targetWeightKg: "22,5", targetDurationSeconds: "45" },
    ],
  };
  const before = structuredClone(draft);
  const result = parsePrescriptionInput(draft);
  expect(result.sets).toBe(2);
  expect(result.target).toEqual({
    repsMin: null,
    repsMax: null,
    targetWeightKg: null,
    targetDurationSeconds: null,
    targetDistanceMeters: null,
  });
  expect(result.series?.map((row) => [row.targetWeightKg, row.targetDurationSeconds])).toEqual([
    [20, 60],
    [22.5, 45],
  ]);
  expect(prescriptionToInput(result)).toEqual(draft);
  expect(draft).toEqual(before);
  expect(
    prescriptionInputSchema.safeParse({ ...draft, sets: "3", target: one.target }).success,
  ).toBe(false);
});
it("el detalle mantiene su modo incluso si todas las series son iguales", () => {
  const one = defaultPrescriptionInput("bodyweight_reps");
  if (one.mode !== "uniform") throw Error("fixture");
  const draft = {
    mode: "series" as const,
    recordType: one.recordType,
    series: [one.target, { ...one.target }],
  };
  expect(prescriptionToInput(parsePrescriptionInput(draft))).toEqual(draft);
});
it("texto parcial se protege como entrada y no se normaliza al fallar la preparación", () => {
  const draft = defaultPrescriptionInput("weight_reps");
  if (draft.mode !== "uniform") throw Error("fixture");
  draft.target.targetWeightKg = "62,";
  const before = structuredClone(draft);
  expect(prescriptionInputSchema.safeParse(draft).success).toBe(true);
  expect(() => parsePrescriptionInput(draft)).toThrow();
  expect(draft).toEqual(before);
  draft.target.targetWeightKg = "62,50";
  expect(parsePrescriptionInput(draft).target.targetWeightKg).toBe(62.5);
  draft.target.targetWeightKg = "0";
  expect(parsePrescriptionInput(draft).target.targetWeightKg).toBe(0);
  draft.target.targetWeightKg = "";
  expect(parsePrescriptionInput(draft).target.targetWeightKg).toBeNull();
});
it("una dimensión inaplicable no se descarta aunque las otras sean válidas", () => {
  const draft = defaultPrescriptionInput("duration");
  if (draft.mode !== "uniform") throw Error("fixture");
  draft.target.targetDurationSeconds = "45";
  draft.target.repsMin = "8";
  const before = structuredClone(draft);
  expect(() => parsePrescriptionInput(draft)).toThrow();
  expect(draft).toEqual(before);
});
it("límites y números ambiguos no producen una prescripción enviable", () => {
  const base = defaultPrescriptionInput("weight_reps");
  if (base.mode !== "uniform") throw Error("fixture");
  for (const sets of ["", "0", "11", "1,5", "1e1"]) {
    expect(() => parsePrescriptionInput({ ...base, sets })).toThrow();
  }
  for (const targetWeightKg of ["-1", "500,01", "1.000", "1e2", "1,234", "NaN"]) {
    expect(() =>
      parsePrescriptionInput({ ...base, target: { ...base.target, targetWeightKg } }),
    ).toThrow();
  }
  expect(() =>
    parsePrescriptionInput({ ...base, target: { ...base.target, repsMin: "12", repsMax: "8" } }),
  ).toThrow();
  const timed = defaultPrescriptionInput("distance_duration");
  if (timed.mode !== "uniform") throw Error("fixture");
  for (const targetDurationSeconds of ["0", "86401", "30,5"]) {
    expect(() =>
      parsePrescriptionInput({ ...timed, target: { ...timed.target, targetDurationSeconds } }),
    ).toThrow();
  }
  for (const targetDistanceMeters of ["0", "1000000,01"]) {
    expect(() =>
      parsePrescriptionInput({ ...timed, target: { ...timed.target, targetDistanceMeters } }),
    ).toThrow();
  }
});
it("campos ajenos, versiones/tipos futuros y detalles vacíos o excesivos se rechazan", () => {
  const base = defaultPrescriptionInput(null);
  if (base.mode !== "uniform") throw Error("fixture");
  for (const value of [
    { ...base, effort: "8" },
    { ...base, athleteNote: "No es una indicación" },
    { ...base, recordType: "future" },
    { ...base, mode: "future" },
    { ...base, target: { ...base.target, calories: "500" } },
    { mode: "series", recordType: null, series: [] },
    { mode: "series", recordType: null, series: Array.from({ length: 11 }, () => base.target) },
  ])
    expect(prescriptionInputSchema.safeParse(value).success).toBe(false);
});
