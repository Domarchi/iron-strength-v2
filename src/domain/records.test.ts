import { describe, expect, it } from "vitest";
import { bestMarks, detectRecords, estimated1RM, type SetRecord } from "./records";

const set = (exerciseId: string, weightKg: number, reps: number, isWarmup = false): SetRecord => ({
  exerciseId,
  weightKg,
  reps,
  isWarmup,
});

describe("estimated1RM (Epley)", () => {
  it("con 1 repetición es el propio peso", () => {
    expect(estimated1RM(100, 1)).toBe(100);
  });

  it("aplica peso × (1 + reps / 30)", () => {
    expect(estimated1RM(100, 5)).toBeCloseTo(116.6667, 3);
    expect(estimated1RM(60, 10)).toBeCloseTo(80, 5);
  });

  it("un peso de 0 (peso corporal) no tiene 1RM", () => {
    expect(estimated1RM(0, 10)).toBe(0);
  });
});

describe("bestMarks (mejores marcas por ejercicio)", () => {
  it("toma el mayor peso y el mejor 1RM estimado de cada ejercicio", () => {
    const marks = bestMarks([set("sq", 100, 5), set("sq", 90, 10), set("bp", 60, 8)]);
    expect(marks.get("sq")).toEqual({ weightKg: 100, estimated1RM: estimated1RM(90, 10) });
    expect(marks.get("bp")?.weightKg).toBe(60);
  });

  it("el mejor 1RM puede venir de una serie más liviana con más repeticiones", () => {
    const marks = bestMarks([set("sq", 100, 1), set("sq", 90, 12)]);
    expect(marks.get("sq")?.weightKg).toBe(100);
    expect(marks.get("sq")?.estimated1RM).toBeCloseTo(126, 5);
  });

  it("ignora el calentamiento y el peso 0", () => {
    const marks = bestMarks([set("sq", 140, 3, true), set("sq", 100, 5), set("pu", 0, 20)]);
    expect(marks.get("sq")?.weightKg).toBe(100);
    expect(marks.has("pu")).toBe(false);
  });
});

describe("detectRecords (RF-28, DC-7)", () => {
  it("el primer registro de un ejercicio no se celebra", () => {
    expect(detectRecords([], [set("sq", 100, 5)])).toEqual([]);
    // Tiene historial de otro ejercicio, pero no de este
    expect(detectRecords([set("bp", 60, 8)], [set("sq", 100, 5)])).toEqual([]);
  });

  it("un peso mayor que el histórico es récord de peso y de 1RM", () => {
    const events = detectRecords([set("sq", 100, 5)], [set("sq", 105, 5)]);
    expect(events).toEqual([
      { exerciseId: "sq", type: "weight", value: 105, previous: 100 },
      {
        exerciseId: "sq",
        type: "estimated1rm",
        value: estimated1RM(105, 5),
        previous: estimated1RM(100, 5),
      },
    ]);
  });

  it("más repeticiones con el mismo peso solo mejora el 1RM", () => {
    const events = detectRecords([set("sq", 100, 5)], [set("sq", 100, 8)]);
    expect(events.map((e) => e.type)).toEqual(["estimated1rm"]);
  });

  it("menos peso con muchas repeticiones puede mejorar solo el 1RM", () => {
    const events = detectRecords([set("sq", 100, 1)], [set("sq", 90, 12)]);
    expect(events.map((e) => e.type)).toEqual(["estimated1rm"]);
  });

  it("un empate no es récord", () => {
    expect(detectRecords([set("sq", 100, 5)], [set("sq", 100, 5)])).toEqual([]);
  });

  it("peor que el histórico no es récord", () => {
    expect(detectRecords([set("sq", 100, 5)], [set("sq", 80, 5)])).toEqual([]);
  });

  it("el calentamiento no genera récords ni cuenta como histórico", () => {
    // Un calentamiento muy pesado en la historia no sube la vara
    expect(
      detectRecords([set("sq", 200, 1, true), set("sq", 100, 5)], [set("sq", 105, 5)]),
    ).not.toEqual([]);
    // Un calentamiento en la sesión actual no es récord
    expect(detectRecords([set("sq", 100, 5)], [set("sq", 150, 3, true)])).toEqual([]);
  });

  it("varias series del mismo ejercicio en la sesión informan un solo récord por tipo (la mejor)", () => {
    const events = detectRecords(
      [set("sq", 100, 5)],
      [set("sq", 102.5, 5), set("sq", 107.5, 3), set("sq", 105, 5)],
    );
    expect(events.filter((e) => e.type === "weight")).toEqual([
      { exerciseId: "sq", type: "weight", value: 107.5, previous: 100 },
    ]);
    expect(events.filter((e) => e.type === "estimated1rm")).toHaveLength(1);
  });

  it("cada ejercicio se evalúa por separado", () => {
    const events = detectRecords(
      [set("sq", 100, 5), set("bp", 60, 8)],
      [set("sq", 80, 5), set("bp", 65, 8)],
    );
    expect(events.every((e) => e.exerciseId === "bp")).toBe(true);
  });

  it("el peso corporal (peso 0) no genera récords", () => {
    expect(detectRecords([set("pu", 0, 10)], [set("pu", 0, 20)])).toEqual([]);
  });

  it("la sensibilidad numérica no inventa récords", () => {
    expect(detectRecords([set("sq", 62.5, 5)], [set("sq", 62.5, 5)])).toEqual([]);
  });
});
