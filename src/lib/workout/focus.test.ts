import { expect, it } from "vitest";
import { createDraft, updateSetField } from "./runner-state";
import {
  resolveWorkoutFocus,
  focusedExerciseIds,
  rememberWorkoutFocus,
  readWorkoutFocus,
} from "./focus";
const draft = () =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId: "user",
    plannedSession: { id: "session", programId: "p", label: "A" },
    now: new Date("2026-10-21T12:00:00Z"),
    exercises: [0, 1, 2].map((i) => ({
      sessionExerciseId: `se${i}`,
      exerciseId: `ex${i}`,
      name: `Exercise ${i}`,
      isBodyweight: false,
      prescribed: { sets: 1, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
      lastWeightKg: null,
      ...(i < 2 ? { supersetId: "group" } : {}),
    })),
  });
it("recupera la elección pendiente y mantiene el grupo junto", () => {
  const d = draft();
  expect(resolveWorkoutFocus(d, "se1")).toBe("se1");
  expect(focusedExerciseIds(d, "se1")).toEqual(["se0", "se1"]);
  expect(focusedExerciseIds(d, "se2")).toEqual(["se2"]);
});
it("un elegido terminado, saltado o eliminado vuelve al siguiente pendiente", () => {
  const d = draft();
  d.exercises[2].sets[0].done = true;
  expect(resolveWorkoutFocus(d, "se2")).toBe("se0");
  expect(resolveWorkoutFocus(d, "missing")).toBe("se0");
  d.exercises[0].skipped = true;
  expect(resolveWorkoutFocus(d, "se0")).toBe("se1");
});
it("cambiar el foco no modifica series ni el descanso y todos completos no tienen siguiente", () => {
  const d = updateSetField(draft(), 0, 0, "weight", "62,5");
  const before = structuredClone(d);
  focusedExerciseIds(d, "se2");
  resolveWorkoutFocus(d);
  expect(d).toEqual(before);
  d.exercises.forEach((e) => e.sets.forEach((s) => (s.done = true)));
  expect(resolveWorkoutFocus(d)).toBeNull();
  expect(focusedExerciseIds(d, null)).toEqual([]);
});

it("la preferencia de vista no reescribe el borrador y conserva versiones desconocidas", () => {
  const map = new Map<string, string>();
  const store = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
  const d = draft();
  store.setItem("is:draft:v2:user:session", "datos de otra pestaña");
  expect(rememberWorkoutFocus(store, d, "se2")).toBe(true);
  expect(readWorkoutFocus(store, d)).toBe("se2");
  expect(store.getItem("is:draft:v2:user:session")).toBe("datos de otra pestaña");
  store.setItem(`is:workout-focus:v1:user:${d.workoutId}`, '{"version":99}');
  expect(rememberWorkoutFocus(store, d, "se1")).toBe(false);
  expect(readWorkoutFocus(store, d)).toBe("se0");
});
