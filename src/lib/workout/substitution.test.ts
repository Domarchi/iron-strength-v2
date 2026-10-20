import { expect, it } from "vitest";
import { createDraft, buildPayload, completeSet } from "./runner-state";
import { loadDraft, saveDraft, type DraftStorage } from "./draft";
import { substituteExercise } from "./substitution";
const original = {
  sessionExerciseId: "row",
  exerciseId: "original",
  name: "Sentadilla",
  isBodyweight: false,
  prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
  lastWeightKg: 55,
  supersetId: "group",
  supersetRestSeconds: 120,
  alternatives: [
    {
      exerciseId: "alternative",
      name: "Prensa",
      isBodyweight: false,
      prescribed: { sets: 2, repsMin: 6, repsMax: 10, targetWeightKg: 22.5 },
      lastWeightKg: 20,
    },
  ],
};
const make = () =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId: "student",
    plannedSession: { id: "session", programId: "program", label: "A" },
    exercises: [original],
    now: new Date("2026-10-20T12:00:00Z"),
  });
it("cambia a una alternativa autorizada, conserva grupo y genera su prescripción propia", () => {
  const before = make();
  const next = substituteExercise(before, 0, "alternative");
  expect(next.exercises[0]).toMatchObject({
    exerciseId: "alternative",
    name: "Prensa",
    sessionExerciseId: "row",
    supersetId: "group",
    supersetRestSeconds: 120,
    prescribed: { sets: 2, repsMin: 6, repsMax: 10, targetWeightKg: 22.5 },
    original: { exerciseId: "original", name: "Sentadilla" },
  });
  expect(next.exercises[0].sets).toHaveLength(2);
  expect(next.exercises[0].sets.every((s) => s.weight === "22,5" && !s.done)).toBe(true);
  expect(substituteExercise(next, 0, "original").exercises[0]).toMatchObject({
    exerciseId: "original",
    name: "Sentadilla",
    prescribed: original.prescribed,
  });
});
it("rechaza opciones no autorizadas y cambios después de completar cualquier serie", () => {
  const before = make();
  expect(substituteExercise(before, 0, "arbitrary")).toBe(before);
  const done = completeSet(before, 0, 0, null).draft;
  expect(substituteExercise(done, 0, "alternative")).toBe(done);
});
it("el envío conserva identidad prescrita y realizada sin cambiar la posición", () => {
  const switched = substituteExercise(make(), 0, "alternative");
  const done = completeSet(switched, 0, 0, null).draft;
  const payload = buildPayload(done, new Date("2026-10-20T13:00:00Z"));
  expect(payload.ok).toBe(true);
  if (payload.ok)
    expect(payload.payload.sets[0]).toMatchObject({
      sessionExerciseId: "row",
      prescribedExerciseId: "original",
      exerciseId: "alternative",
      exerciseName: "Prensa",
      position: 0,
    });
});

it("recupera la elección y las opciones después de guardar y volver a abrir", () => {
  const data = new Map<string, string>();
  const storage: DraftStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  const changed = substituteExercise(make(), 0, "alternative");
  expect(saveDraft(storage, changed)).toBe(true);
  const recovered = loadDraft(storage, "student", "session")!;
  expect(recovered).toEqual(changed);
  expect(substituteExercise(recovered, 0, "original").exercises[0].exerciseId).toBe("original");
});
