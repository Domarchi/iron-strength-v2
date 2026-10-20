import { expect, it } from "vitest";
import { compareProgressPeriods, progressPeriods, parseProgressWeeks } from "./progress-period";
import type { ProgressPoint } from "./volume";
const point = (date: string, value: number, id = date): ProgressPoint => ({
  date,
  workoutId: id,
  estimated1RM: value,
  volumeKg: value * 10,
  bodyweightReps: value,
});
it("periodos contiguos y equivalentes incluyen hoy, sin solaparse", () => {
  expect(progressPeriods("2026-10-20", 4)).toEqual({
    currentStart: "2026-09-23",
    currentEnd: "2026-10-20",
    previousStart: "2026-08-26",
    previousEnd: "2026-09-22",
    days: 28,
  });
  expect(progressPeriods("2026-03-02", 12).days).toBe(84);
  expect(parseProgressWeeks("4")).toBe(4);
  expect(parseProgressWeeks("12")).toBe(12);
  expect(parseProgressWeeks("1000")).toBe(8);
  expect(parseProgressWeeks()).toBe(8);
});
it("filtra extremos, ignora futuro y conserva dos entrenamientos del mismo día", () => {
  const result = compareProgressPeriods(
    [
      point("2026-08-25", 500),
      point("2026-08-26", 100),
      point("2026-09-22", 120),
      point("2026-09-23", 125),
      point("2026-10-20", 130, "a"),
      point("2026-10-20", 140, "b"),
      point("2026-10-21", 600),
    ],
    "2026-10-20",
    4,
    "1rm",
  );
  expect(result.current).toHaveLength(3);
  expect(result.previous).toHaveLength(2);
  expect(result.currentValue).toBe(140);
  expect(result.previousValue).toBe(120);
  expect(result.changePercent).toBeCloseTo(100 / 6);
});
it("compara volumen y repeticiones sumados, y no inventa tendencias sin base", () => {
  const rows = [point("2026-09-01", 10), point("2026-10-01", 15), point("2026-10-02", 5)];
  expect(compareProgressPeriods(rows, "2026-10-20", 4, "volume")).toMatchObject({
    currentValue: 200,
    previousValue: 100,
    changePercent: 100,
  });
  expect(compareProgressPeriods(rows, "2026-10-20", 4, "reps")).toMatchObject({
    currentValue: 20,
    previousValue: 10,
  });
  expect(
    compareProgressPeriods([point("2026-10-01", 10)], "2026-10-20", 4, "1rm").changePercent,
  ).toBeNull();
  expect(
    compareProgressPeriods(
      [point("2026-09-01", 0), point("2026-10-01", 10)],
      "2026-10-20",
      4,
      "1rm",
    ).changePercent,
  ).toBeNull();
  expect(compareProgressPeriods([], "2026-10-20", 4, "1rm")).toMatchObject({
    currentValue: null,
    previousValue: null,
  });
});
