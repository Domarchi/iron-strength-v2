import { describe, expect, it } from "vitest";
import { nextSupersetSet, finishedSupersetRound, type RoundExercise } from "./superset-rounds";

const set = (done = false, isWarmup = false) => ({ done, isWarmup });
const exercises = (): RoundExercise[] => [
  { supersetId: "group", skipped: false, sets: [set(), set(), set()] },
  { supersetId: "group", skipped: false, sets: [set(), set()] },
];

describe("rondas de superserie", () => {
  it("alterna integrantes y continúa cuando uno tiene menos series", () => {
    const rows = exercises();
    for (const [exerciseIndex, setIndex, round] of [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 2],
    ]) {
      expect(nextSupersetSet(rows, "group")).toEqual({ exerciseIndex, setIndex, round });
      const before = structuredClone(rows);
      rows[exerciseIndex].sets[setIndex].done = true;
      expect(finishedSupersetRound(before, rows, "group")).toBe(exerciseIndex === 1 || round === 2);
    }
    expect(nextSupersetSet(rows, "group")).toBeNull();
  });
  it("calentamientos y ejercicios saltados no cuentan como integrantes pendientes", () => {
    const rows = exercises();
    rows[0].sets.unshift(set(false, true));
    expect(nextSupersetSet(rows, "group")).toEqual({ exerciseIndex: 0, setIndex: 1, round: 0 });
    const before = structuredClone(rows);
    rows[0].sets[0].done = true;
    expect(finishedSupersetRound(before, rows, "group")).toBe(false);
    rows[1].skipped = true;
    rows[0].sets[1].done = true;
    expect(nextSupersetSet(rows, "group")).toEqual({ exerciseIndex: 0, setIndex: 2, round: 1 });
  });
  it("una serie adelantada no dispara descanso ni pierde la ronda pendiente", () => {
    const rows = exercises(),
      before = structuredClone(rows);
    rows[1].sets[1].done = true;
    expect(finishedSupersetRound(before, rows, "group")).toBe(false);
    expect(nextSupersetSet(JSON.parse(JSON.stringify(rows)), "group")?.round).toBe(0);
    expect(nextSupersetSet(rows, "otro")).toBeNull();
  });
});
