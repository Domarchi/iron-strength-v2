import { describe, expect, it } from "vitest";
import { recordCountsByWorkout } from "./record-counts";

const point = (workoutId: string, records: number) =>
  ({ workoutId, records: Array.from({ length: records }, () => ({})) }) as never;

describe("recordCountsByWorkout", () => {
  it("suma las marcas mejoradas de todos los ejercicios de cada entrenamiento", () => {
    const counts = recordCountsByWorkout({
      exercises: [
        { points: [point("a", 2), point("b", 0)] },
        { points: [point("a", 1), point("c", 1)] },
      ] as never,
    });
    expect(counts.get("a")).toBe(3);
    expect(counts.get("c")).toBe(1);
    expect(counts.has("b")).toBe(false);
  });
  it("sin ejercicios no hay récords", () => {
    expect(recordCountsByWorkout({ exercises: [] }).size).toBe(0);
  });
});
