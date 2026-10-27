import { describe, expect, it } from "vitest";
import {
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingSetDetailsSchema,
  athleteNoteSchema,
  trainingTotals,
  legacyTrainingSet,
  formatTrainingMetrics,
  trainingTargetSummary,
} from "./training-metrics";

import { trainingMetricCases as cases } from "../test/fixtures/training-metrics";
const empty = { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null };

describe("métricas canónicas sin convertir tiempo/distancia en repeticiones", () => {
  for (const row of cases) {
    it(`acepta únicamente las dimensiones de ${row.recordType ?? "legado"}`, () => {
      expect(trainingMetricsSchema.parse(row)).toEqual(row);
      for (const key of Object.keys(empty) as (keyof typeof empty)[]) {
        expect(
          trainingMetricsSchema.safeParse({ ...row, [key]: row[key] === null ? 1 : null }).success,
        ).toBe(false);
      }
      expect(trainingMetricsSchema.safeParse({ ...row, extra: 1 }).success).toBe(false);
      expect(formatTrainingMetrics(row)).not.toMatch(/null|undefined|NaN/);
    });
  }
  it("rechaza precisión, cero no permitido, límites, booleanos y números como texto", () => {
    for (const value of [-1, 500.01, 0.001, Infinity, NaN, "30", true])
      expect(trainingMetricsSchema.safeParse({ ...cases[1], weightKg: value }).success).toBe(false);
    for (const value of [0, 101, 1.5, "8"])
      expect(trainingMetricsSchema.safeParse({ ...cases[1], reps: value }).success).toBe(false);
    for (const value of [0, 86401, 1.5, "60"])
      expect(trainingMetricsSchema.safeParse({ ...cases[5], durationSeconds: value }).success).toBe(
        false,
      );
    for (const value of [0, -1, 1000000.01, 0.001, "10"])
      expect(trainingMetricsSchema.safeParse({ ...cases[8], distanceMeters: value }).success).toBe(
        false,
      );
    expect(trainingMetricsSchema.safeParse({ ...cases[0], recordType: "future" }).success).toBe(
      false,
    );
  });
  it("presenta las unidades reales y distingue carga adicional de asistencia", () => {
    expect(cases.map(formatTrainingMetrics)).toEqual([
      "30 kg × 8 reps",
      "30 kg × 8 reps",
      "8 reps",
      "+10 kg × 8 reps",
      "20 kg de asistencia × 8 reps",
      "60 s",
      "20 kg × 60 s",
      "1.000 m · 300 s",
      "20 kg × 30,5 m",
    ]);
  });
  it("tipos y esfuerzo no inventan fallos de cero reps ni aceptan versiones implícitas", () => {
    for (const setType of ["working", "warmup", "failure", "drop"])
      for (const effort of [null, 1, 5.5, 10])
        expect(trainingSetDetailsSchema.parse({ setType, effort })).toEqual({ setType, effort });
    for (const effort of [0, 10.5, 5.1, "8", undefined])
      expect(trainingSetDetailsSchema.safeParse({ setType: "working", effort }).success).toBe(
        false,
      );
    expect(trainingSetDetailsSchema.safeParse({ setType: "future", effort: null }).success).toBe(
      false,
    );
  });
  it("mantiene notas Unicode, espacios y líneas; no recorta ni permite más de500 caracteres", () => {
    for (const value of [null, "", "  Nota\npropia  ", "💪".repeat(500)])
      expect(athleteNoteSchema.parse(value)).toBe(value);
    expect(athleteNoteSchema.safeParse("💪".repeat(501)).success).toBe(false);
    expect(athleteNoteSchema.safeParse(1).success).toBe(false);
  });
  it("suma dimensiones compatibles; asistencia/carga-tiempo no son volumen externo", () => {
    const rows = cases.map((row) => ({ ...row, setType: "working" as const, effort: null }));
    const before = structuredClone(rows);
    expect(
      trainingTotals([...rows, ...rows.map((row) => ({ ...row, setType: "warmup" as const }))]),
    ).toEqual({
      workingSets: 9,
      externalVolumeKg: 560,
      bodyweightReps: 24,
      durationSeconds: 420,
      distanceMeters: 1030.5,
    });
    expect(rows).toEqual(before);
    expect(trainingTotals([]).workingSets).toBe(0);
    expect(
      trainingTotals([
        { ...cases[1], setType: "failure", effort: 9 },
        { ...cases[1], setType: "drop", effort: null },
      ]).externalVolumeKg,
    ).toBe(480);
  });
  it("el legado se convierte explícitamente, sin consultar metadatos actuales", () => {
    expect(legacyTrainingSet({ weightKg: 0, reps: 8, isWarmup: false })).toMatchObject({
      recordType: null,
      setType: "working",
      effort: null,
      reps: 8,
      weightKg: 0,
      durationSeconds: null,
      distanceMeters: null,
    });
    expect(
      trainingTotals([legacyTrainingSet({ weightKg: 0, reps: 8, isWarmup: false })]).bodyweightReps,
    ).toBe(8);
    expect(legacyTrainingSet({ weightKg: 20, reps: 5, isWarmup: true }).setType).toBe("warmup");
    expect(() => legacyTrainingSet({ weightKg: -1, reps: 8, isWarmup: false })).toThrow();
  });
});

const target = {
  repsMin: 8,
  repsMax: 12,
  targetWeightKg: 30,
  targetDurationSeconds: null,
  targetDistanceMeters: null,
};
describe("objetivos uniformes y por serie del mismo tipo", () => {
  it("cada tipo conserva sus objetivos y los campos que no corresponden permanecen null", () => {
    for (const row of cases) {
      const target = {
        repsMin: row.reps === null ? null : 8,
        repsMax: row.reps === null ? null : 12,
        targetWeightKg: row.weightKg,
        targetDurationSeconds: row.durationSeconds,
        targetDistanceMeters: row.distanceMeters,
      };
      const value = { recordType: row.recordType, sets: 2, target, series: [target, target] };
      expect(trainingPrescriptionSchema.parse(value)).toEqual(value);
    }
    expect(() => trainingTargetSummary([])).toThrow("al menos un objetivo");
  });
  it("dos duraciones diferentes conservan el detalle sin inventar un tiempo común", () => {
    const first = {
      repsMin: null,
      repsMax: null,
      targetWeightKg: null,
      targetDurationSeconds: 60,
      targetDistanceMeters: null,
    };
    const second = { ...first, targetDurationSeconds: 90 };
    const summary = trainingTargetSummary([first, second]);
    expect(summary).toEqual({ ...first, targetDurationSeconds: null });
    expect(
      trainingPrescriptionSchema.parse({
        recordType: "duration",
        sets: 2,
        target: summary,
        series: [first, second],
      }).series,
    ).toEqual([first, second]);
  });
  it("conserva objetivos conocidos y admite dimensiones sin prescribir", () => {
    for (const recordType of [null, "weight_reps", "weighted_bodyweight", "assisted_bodyweight"])
      expect(
        trainingPrescriptionSchema.safeParse({ recordType, sets: 2, target, series: null }).success,
      ).toBe(true);
    expect(
      trainingPrescriptionSchema.safeParse({
        recordType: "duration",
        sets: 2,
        target: { ...target, repsMin: null, repsMax: null, targetWeightKg: null },
        series: null,
      }).success,
    ).toBe(true);
  });
  it("exige resumen y cantidad coherentes sin quitar los objetivos diferentes", () => {
    const series = [target, { ...target, repsMin: 10, targetWeightKg: 25 }];
    const valid = {
      recordType: "weight_reps",
      sets: 2,
      target: { ...target, targetWeightKg: null },
      series,
    };
    expect(trainingPrescriptionSchema.parse(valid)).toEqual(valid);
    for (const change of [
      { sets: 1 },
      { target },
      { series: [] },
      { sets: 11 },
      { recordType: "duration" },
    ])
      expect(trainingPrescriptionSchema.safeParse({ ...valid, ...change }).success).toBe(false);
    expect(
      trainingPrescriptionSchema.safeParse({ ...valid, target: { ...valid.target, repsMin: 13 } })
        .success,
    ).toBe(false);
  });
});
