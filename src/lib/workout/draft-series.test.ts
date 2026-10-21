import { expect, it } from "vitest";
import { createDraft } from "./runner-state";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  draftKey,
  previousDraftKey,
  legacyDraftKey,
  type WorkoutDraft,
} from "./draft";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}
const legacy = () => ({
  ...createDraft({
    workoutId: crypto.randomUUID(),
    userId: "user",
    plannedSession: { id: "session", programId: "program", label: "A" },
    exercises: [
      {
        sessionExerciseId: "row",
        exerciseId: "exercise",
        name: "Press",
        isBodyweight: false,
        prescribed: { sets: 2, repsMin: 6, repsMax: 12, targetWeightKg: null },
        lastWeightKg: null,
      },
    ],
    now: new Date("2026-10-21T10:00:00Z"),
  }),
  version: 1 as const,
});
it("migra sobre v2 solo después de confirmar v3, manteniendo valores y objetivo uniforme", () => {
  const store = storage(),
    old = legacy(),
    raw = JSON.stringify({ version: 2, draft: old });
  store.setItem(previousDraftKey("user", "session"), raw);
  const broken = {
    ...store,
    setItem: () => {
      throw new Error("quota");
    },
  };
  expect(loadDraft(broken, "user", "session")?.workoutId).toBe(old.workoutId);
  expect(store.getItem(previousDraftKey("user", "session"))).toBe(raw);
  const migrated = loadDraft(store, "user", "session");
  expect(migrated?.version).toBe(2);
  expect(migrated?.exercises).toEqual(old.exercises);
  expect(JSON.parse(store.getItem(draftKey("user", "session"))!).version).toBe(3);
  expect(store.getItem(previousDraftKey("user", "session"))).toBeNull();
});
it("guarda detalle y no elimina formatos futuros ni otra sesión al confirmar", () => {
  const store = storage(),
    old = legacy();
  const draft: WorkoutDraft = {
    ...old,
    version: 2,
    exercises: old.exercises.map((e) => ({
      ...e,
      prescribed: {
        sets: 2,
        repsMin: 6,
        repsMax: 12,
        targetWeightKg: null,
        series: [
          { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
          { repsMin: 10, repsMax: 12, targetWeightKg: 70 },
        ],
      },
    })),
  };
  expect(saveDraft(store, draft)).toBe(true);
  expect(loadDraft(store, "user", "session")?.exercises).toEqual(draft.exercises);
  const unknown = JSON.stringify({ version: 99, draft: old });
  store.setItem(previousDraftKey("user", "session"), unknown);
  store.setItem(
    legacyDraftKey("user", "other"),
    JSON.stringify({ ...old, plannedSessionId: "other", workoutId: crypto.randomUUID() }),
  );
  clearDraft(store, "user", "session", old.workoutId);
  expect(store.getItem(previousDraftKey("user", "session"))).toBe(unknown);
  expect(store.getItem(legacyDraftKey("user", "other"))).not.toBeNull();
});
it("no sobrescribe una copia futura ni interpreta series nuevas etiquetadas como contenido v1", () => {
  const store = storage(),
    old = legacy(),
    unknown = JSON.stringify({ version: 99 });
  store.setItem(draftKey("user", "session"), unknown);
  expect(saveDraft(store, old)).toBe(false);
  expect(store.getItem(draftKey("user", "session"))).toBe(unknown);
  store.removeItem(draftKey("user", "session"));
  const wrong = JSON.stringify({
    ...old,
    exercises: old.exercises.map((e) => ({
      ...e,
      prescribed: { ...e.prescribed, series: [{ repsMin: 6, repsMax: 12, targetWeightKg: null }] },
    })),
  });
  store.setItem(legacyDraftKey("user", "session"), wrong);
  expect(loadDraft(store, "user", "session")).toBeNull();
  expect(store.getItem(legacyDraftKey("user", "session"))).toBe(wrong);
});
