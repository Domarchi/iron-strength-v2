import { describe, expect, it } from "vitest";
import { countRecordsPerWorkout, summarizeWeek, type SummaryWorkout } from "./weekly-summary";

const set = (exerciseId: string, weightKg: number, reps: number, isWarmup = false) => ({
  exerciseId,
  weightKg,
  reps,
  isWarmup,
});

const w = (id: string, startedAt: string, sets: ReturnType<typeof set>[]): SummaryWorkout => ({
  id,
  startedAt,
  performedOn: startedAt.slice(0, 10),
  sets,
});

describe("countRecordsPerWorkout (RF-32; DC-29)", () => {
  it("el primer registro de un ejercicio no es récord; superar lo anterior sí", () => {
    const result = countRecordsPerWorkout([
      w("w1", "2026-09-28T15:00:00Z", [set("sq", 60, 10)]),
      w("w2", "2026-10-01T15:00:00Z", [set("sq", 70, 10)]),
      w("w3", "2026-10-03T15:00:00Z", [set("sq", 65, 5)]),
    ]);
    expect(result.get("w1")).toBe(0);
    expect(result.get("w2")).toBeGreaterThan(0);
    expect(result.get("w3")).toBe(0);
  });

  it("ordena por fecha aunque lleguen desordenados", () => {
    const result = countRecordsPerWorkout([
      w("late", "2026-10-03T15:00:00Z", [set("sq", 70, 10)]),
      w("early", "2026-09-28T15:00:00Z", [set("sq", 60, 10)]),
    ]);
    expect(result.get("early")).toBe(0);
    expect(result.get("late")).toBeGreaterThan(0);
  });

  it("los calentamientos no cuentan", () => {
    const result = countRecordsPerWorkout([
      w("a", "2026-09-28T15:00:00Z", [set("sq", 60, 10)]),
      w("b", "2026-10-01T15:00:00Z", [set("sq", 100, 10, true)]),
    ]);
    expect(result.get("b")).toBe(0);
  });
});

describe("summarizeWeek", () => {
  const workouts = [
    w("a", "2026-09-30T15:00:00Z", [set("sq", 60, 10), set("sq", 60, 8)]), // semana anterior (lun 28)
    w("b", "2026-10-05T15:00:00Z", [set("sq", 70, 10), set("sq", 40, 12, true)]), // esta semana (lun 5)
    w("c", "2026-10-07T15:00:00Z", [set("dom", 0, 12)]), // esta semana, peso corporal
    w("d", "2026-10-07T20:00:00Z", [set("sq", 70, 5)]), // mismo día que c
  ];
  const records = new Map([
    ["a", 0],
    ["b", 2],
    ["c", 0],
    ["d", 0],
  ]);

  it("suma entrenamientos, días entrenados, récords y volumen de la semana", () => {
    const week = summarizeWeek("2026-10-05", workouts, records);
    expect(week.weekEnd).toBe("2026-10-11");
    expect(week.workoutCount).toBe(3);
    expect(week.trainedDays).toBe(2);
    expect(week.records).toBe(2);
    expect(week.volumeKg).toBe(70 * 10 + 70 * 5); // sin calentamientos
    expect(week.bodyweightReps).toBe(12);
  });

  it("la semana anterior se aísla por fecha", () => {
    const week = summarizeWeek("2026-09-28", workouts, records);
    expect(week.workoutCount).toBe(1);
    expect(week.volumeKg).toBe(60 * 18);
    expect(week.records).toBe(0);
  });

  it("una semana sin entrenamientos queda en cero", () => {
    expect(summarizeWeek("2026-09-21", workouts, records)).toMatchObject({
      workoutCount: 0,
      trainedDays: 0,
      records: 0,
      volumeKg: 0,
      bodyweightReps: 0,
    });
  });

  it("un entrenamiento sin series no cuenta", () => {
    const empty = [w("x", "2026-10-06T15:00:00Z", [])];
    expect(summarizeWeek("2026-10-05", empty, new Map()).workoutCount).toBe(0);
  });

  it("el límite de la semana usa la fecha local de Santiago, no la UTC", () => {
    // 2026-10-12 00:30 en Santiago (UTC-3) es 03:30 UTC del mismo día: pertenece a la semana siguiente.
    const edge = [
      {
        id: "e",
        startedAt: "2026-10-12T03:30:00Z",
        performedOn: "2026-10-11",
        sets: [set("sq", 50, 5)],
      },
    ];
    expect(summarizeWeek("2026-10-05", edge, new Map()).workoutCount).toBe(1);
    expect(summarizeWeek("2026-10-12", edge, new Map()).workoutCount).toBe(0);
  });
});
