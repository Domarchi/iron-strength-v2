import { describe, expect, it } from "vitest";
import { exerciseProgressSeries, setVolume, trendVsPrevious, type VolumeSet } from "./volume";
import { estimated1RM } from "./records";

const s = (weightKg: number, reps: number, isWarmup = false): VolumeSet => ({
  weightKg,
  reps,
  isWarmup,
});

describe("setVolume (DC-16)", () => {
  it("suma peso × repeticiones de las series de trabajo", () => {
    expect(setVolume([s(60, 10), s(60, 8)])).toEqual({ loadKg: 1080, bodyweightReps: 0 });
  });

  it("excluye el calentamiento", () => {
    expect(setVolume([s(20, 10, true), s(60, 10)])).toEqual({ loadKg: 600, bodyweightReps: 0 });
  });

  it("el peso corporal cuenta solo repeticiones, aparte de los kilos", () => {
    expect(setVolume([s(0, 15), s(0, 12), s(40, 5)])).toEqual({ loadKg: 200, bodyweightReps: 27 });
  });

  it("sin series, volumen cero", () => {
    expect(setVolume([])).toEqual({ loadKg: 0, bodyweightReps: 0 });
  });

  it("maneja decimales sin arrastrar error de coma flotante", () => {
    expect(setVolume([s(62.5, 8), s(62.5, 8), s(62.5, 8)]).loadKg).toBe(1500);
    expect(setVolume([s(0.1, 3), s(0.2, 3)]).loadKg).toBeCloseTo(0.9, 10);
  });
});

describe("trendVsPrevious", () => {
  it("devuelve la variación respecto a la semana anterior como fracción", () => {
    expect(trendVsPrevious(1200, 1000)).toBeCloseTo(0.2, 10);
    expect(trendVsPrevious(800, 1000)).toBeCloseTo(-0.2, 10);
    expect(trendVsPrevious(1000, 1000)).toBe(0);
  });

  it("sin semana previa con datos no hay tendencia", () => {
    expect(trendVsPrevious(1000, null)).toBeNull();
    expect(trendVsPrevious(1000, 0)).toBeNull();
  });
});

describe("exerciseProgressSeries (RF-30)", () => {
  const entries = [
    { workoutId: "b", date: "2026-10-08", sets: [s(62.5, 8), s(62.5, 8)] },
    { workoutId: "a", date: "2026-10-01", sets: [s(60, 8), s(60, 6)] },
    { workoutId: "w", date: "2026-10-05", sets: [s(20, 10, true)] },
  ];

  it("ordena por fecha y calcula el mejor 1RM estimado de cada entrenamiento", () => {
    const series = exerciseProgressSeries(entries);
    expect(series.map((p) => p.workoutId)).toEqual(["a", "b"]);
    expect(series[0].estimated1RM).toBeCloseTo(estimated1RM(60, 8), 8);
    expect(series[1].estimated1RM).toBeCloseTo(estimated1RM(62.5, 8), 8);
  });

  it("incluye el volumen de cada entrenamiento", () => {
    const series = exerciseProgressSeries(entries);
    expect(series[0].volumeKg).toBe(60 * 8 + 60 * 6);
    expect(series[1].volumeKg).toBe(62.5 * 16);
  });

  it("omite los entrenamientos con solo calentamiento", () => {
    expect(exerciseProgressSeries(entries).some((p) => p.workoutId === "w")).toBe(false);
  });

  it("para un ejercicio de peso corporal usa repeticiones en lugar de 1RM", () => {
    const series = exerciseProgressSeries([
      { workoutId: "x", date: "2026-10-01", sets: [s(0, 15), s(0, 12)] },
    ]);
    expect(series).toEqual([
      { workoutId: "x", date: "2026-10-01", estimated1RM: 0, volumeKg: 0, bodyweightReps: 27 },
    ]);
  });

  it("sin entrenamientos, serie vacía", () => {
    expect(exerciseProgressSeries([])).toEqual([]);
  });
});
