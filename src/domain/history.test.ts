import { describe, expect, it } from "vitest";
import { lastByExercise, type HistoryWorkout } from "./history";

const w = (id: string, startedAt: string, sets: HistoryWorkout["sets"]): HistoryWorkout => ({
  id,
  startedAt,
  sets,
});
const s = (exerciseId: string, weightKg: number, reps: number, isWarmup = false) => ({
  exerciseId,
  weightKg,
  reps,
  isWarmup,
});

describe("lastByExercise (RF-20, DC-9)", () => {
  it("toma el entrenamiento más reciente de cada ejercicio, sin importar el orden de entrada", () => {
    const result = lastByExercise([
      w("viejo", "2026-09-01T15:00:00Z", [s("sq", 50, 10)]),
      w("nuevo", "2026-10-01T15:00:00Z", [s("sq", 60, 8), s("sq", 60, 8)]),
    ]);
    expect(result.get("sq")).toMatchObject({ workoutId: "nuevo", date: "2026-10-01" });
    expect(result.get("sq")?.sets).toHaveLength(2);
  });

  it("cada ejercicio usa su propio último entrenamiento", () => {
    const result = lastByExercise([
      w("a", "2026-10-05T15:00:00Z", [s("sq", 60, 8)]),
      w("b", "2026-10-01T15:00:00Z", [s("sq", 55, 8), s("bp", 40, 10)]),
    ]);
    expect(result.get("sq")?.workoutId).toBe("a");
    expect(result.get("bp")?.workoutId).toBe("b");
  });

  it("el último peso usado es el mayor peso de las series de trabajo", () => {
    const result = lastByExercise([
      w("a", "2026-10-05T15:00:00Z", [s("sq", 30, 5, true), s("sq", 60, 8), s("sq", 62.5, 6)]),
    ]);
    expect(result.get("sq")?.topWeightKg).toBe(62.5);
  });

  it("un entrenamiento que solo tiene calentamiento de ese ejercicio no cuenta como 'última vez'", () => {
    const result = lastByExercise([
      w("nuevo", "2026-10-05T15:00:00Z", [s("sq", 30, 5, true)]),
      w("viejo", "2026-10-01T15:00:00Z", [s("sq", 60, 8)]),
    ]);
    expect(result.get("sq")?.workoutId).toBe("viejo");
  });

  it("la fecha es la de Santiago, no la UTC", () => {
    const result = lastByExercise([w("a", "2026-10-06T02:30:00Z", [s("sq", 60, 8)])]); // 23:30 del 5 en Santiago
    expect(result.get("sq")?.date).toBe("2026-10-05");
  });

  it("sin historial devuelve un mapa vacío", () => {
    expect(lastByExercise([]).size).toBe(0);
  });
});
