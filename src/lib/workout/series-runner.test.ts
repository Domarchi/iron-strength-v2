import { expect, it } from "vitest";
import {
  createDraft,
  completeSet,
  targetForSet,
  copySuggestedValues,
  copyLastPerformance,
} from "./runner-state";
import { substituteExercise } from "./substitution";
const series = [
  { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
  { repsMin: 8, repsMax: 10, targetWeightKg: 70 },
  { repsMin: 10, repsMax: 12, targetWeightKg: null },
];
function draft() {
  return createDraft({
    workoutId: crypto.randomUUID(),
    userId: "user",
    plannedSession: { id: "session", programId: "program", label: "A" },
    now: new Date(),
    exercises: [
      {
        sessionExerciseId: "row",
        exerciseId: "squat",
        name: "Sentadilla",
        isBodyweight: false,
        lastWeightKg: 100,
        prescribed: { sets: 3, repsMin: 6, repsMax: 12, targetWeightKg: null, series },
        alternatives: [
          {
            exerciseId: "alt",
            name: "Alternativa",
            isBodyweight: false,
            lastWeightKg: 40,
            prescribed: {
              sets: 2,
              repsMin: 6,
              repsMax: 10,
              targetWeightKg: null,
              series: [
                { repsMin: 6, repsMax: 8, targetWeightKg: 20 },
                { repsMin: 10, repsMax: 10, targetWeightKg: 15 },
              ],
            },
          },
        ],
      },
    ],
  });
}
it("precarga el peso de cada objetivo y conserva el histórico cuando no hay peso indicado", () => {
  const value = draft();
  expect(value.exercises[0].sets.map((s) => s.weight)).toEqual(["75", "70", "100"]);
  expect(value.exercises[0].sets.every((s) => !s.done && s.reps === "")).toBe(true);
  const done = completeSet(value, 0, 1, { weightKg: 100, reps: 15 });
  expect(done.draft.exercises[0].sets[1]).toMatchObject({ weight: "70", reps: "8", done: true });
});
it("calentamientos no consumen objetivos; las series adicionales no inventan objetivos", () => {
  const value = draft(),
    ex = value.exercises[0];
  ex.sets.unshift({ id: "warmup", weight: "20", reps: "5", done: false, isWarmup: true });
  expect(targetForSet(ex, 0)).toBeNull();
  expect(targetForSet(ex, 1)).toEqual(series[0]);
  expect(targetForSet(ex, 3)).toEqual(series[2]);
  ex.sets.push({ ...ex.sets[3], id: "extra" });
  expect(targetForSet(ex, 4)).toBeNull();
});
it("copiar historial conserva completadas y nunca aplica sugerencia uniforme a objetivos variables", () => {
  const done = completeSet(draft(), 0, 0, null).draft;
  expect(copySuggestedValues(done, 0, { weightKg: 105, reps: 6 })).toBe(done);
  const copied = copyLastPerformance(done, 0, {
    sets: series.map(() => ({ weightKg: 100, reps: 15, isWarmup: false })),
  });
  expect(copied.exercises[0].sets[0]).toEqual(done.exercises[0].sets[0]);
  expect(copied.exercises[0].sets[1].weight).toBe("100");
  const alt = substituteExercise(draft(), 0, "alt");
  expect(alt.exercises[0].sets.map((s) => s.weight)).toEqual(["20", "15"]);
  expect(substituteExercise(done, 0, "alt")).toBe(done);
});
