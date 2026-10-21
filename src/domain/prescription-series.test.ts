import { expect, it } from "vitest";
import {
  prescribedSeriesSchema,
  seriesSummary,
  isUniformPrescription,
  seriesTargetAt,
  resizePrescribedSeries,
  coherentPrescriptionSeries,
} from "./prescription-series";
const series = [
  { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
  { repsMin: 8, repsMax: 10, targetWeightKg: 70 },
  { repsMin: 10, repsMax: 12, targetWeightKg: null },
];
it("resume sin perder los objetivos variables y exige coherencia con los campos compatibles", () => {
  const summary = seriesSummary(series);
  expect(summary).toEqual({ sets: 3, repsMin: 6, repsMax: 12, targetWeightKg: null });
  expect(coherentPrescriptionSeries({ ...summary, series })).toBe(true);
  expect(coherentPrescriptionSeries({ ...summary, sets: 2, series })).toBe(false);
  expect(coherentPrescriptionSeries({ ...summary, targetWeightKg: 75, series })).toBe(false);
  expect(isUniformPrescription({ ...summary, series })).toBe(false);
  expect(seriesTargetAt({ ...summary, series }, 0)).toEqual(series[0]);
  expect(seriesTargetAt({ ...summary, series }, -1)).toBeNull();
  expect(seriesTargetAt({ ...summary, series }, 3)).toBeNull();
});
it("la ausencia mantiene el contrato uniforme y los detalles iguales conservan progresión", () => {
  const common = { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 62.5 };
  expect(coherentPrescriptionSeries(common)).toBe(true);
  expect(isUniformPrescription(common)).toBe(true);
  expect(seriesTargetAt(common, 0)).toEqual({ repsMin: 8, repsMax: 12, targetWeightKg: 62.5 });
  const same = Array.from({ length: 3 }, () => ({ repsMin: 8, repsMax: 12, targetWeightKg: 62.5 }));
  expect(seriesSummary(same)).toEqual(common);
  expect(isUniformPrescription({ ...common, series: same })).toBe(true);
});
it("redimensionar conserva las primeras y replica la última sin compartir objetos", () => {
  const resized = resizePrescribedSeries(series, 5);
  expect(resized).toEqual([...series, series[2], series[2]]);
  resized[3].targetWeightKg = 10;
  expect(series[2].targetWeightKg).toBeNull();
  expect(resized[4].targetWeightKg).toBeNull();
  expect(resizePrescribedSeries(series, 1)).toEqual([series[0]]);
  for (const count of [0, 11, 1.5]) expect(() => resizePrescribedSeries(series, count)).toThrow();
});
it("rechaza rangos, cantidad y precisión inválidos, incluidas entradas directas sin interfaz", () => {
  for (const value of [
    [],
    Array.from({ length: 11 }, () => series[0]),
    [{ ...series[0], repsMin: 9 }],
    [{ ...series[0], repsMax: 101 }],
    [{ ...series[0], repsMin: 1.5 }],
    [{ ...series[0], targetWeightKg: -1 }],
    [{ ...series[0], targetWeightKg: 500.01 }],
    [{ ...series[0], targetWeightKg: 1.001 }],
    [{ ...series[0], targetWeightKg: 1e-12 }],
    [{ ...series[0], restSeconds: 90 }],
  ])
    expect(prescribedSeriesSchema.safeParse(value).success).toBe(false);
  expect(
    prescribedSeriesSchema.safeParse([
      { repsMin: 1, repsMax: 100, targetWeightKg: 0 },
      { repsMin: 100, repsMax: 100, targetWeightKg: 500 },
    ]).success,
  ).toBe(true);
});
