import { describe, expect, it } from "vitest";
import { recordLabel, recordsOfWorkout } from "./workout-records";

const ex = (name: string, points: unknown[]) => ({ exerciseId: name, name, points }) as never;
describe("recordsOfWorkout", () => {
  it("devuelve solo las marcas de ese entrenamiento, ordenadas", () => {
    const r = recordsOfWorkout(
      {
        exercises: [
          ex("Sentadilla", [
            {
              workoutId: "w1",
              records: [
                { metric: "estimated1RM", value: 120, previous: 110 },
                { metric: "weightKg", value: 100, previous: 95 },
              ],
            },
            { workoutId: "w2", records: [{ metric: "weightKg", value: 90, previous: 80 }] },
          ]),
          ex("Banca", [{ workoutId: "w1", records: [{ metric: "reps", value: 10, previous: 8 }] }]),
        ] as never,
      },
      "w1",
    );
    expect(r.map((x) => [x.name, x.metric])).toEqual([
      ["Banca", "reps"],
      ["Sentadilla", "weightKg"],
      ["Sentadilla", "estimated1RM"],
    ]);
  });
  it("sin marcas devuelve vacío y etiqueta desconocida es genérica", () => {
    expect(recordsOfWorkout({ exercises: [] }, "w1")).toEqual([]);
    expect(recordLabel("otra")).toBe("Nueva marca");
    expect(recordLabel("weightKg")).toBe("Más peso");
  });
});
