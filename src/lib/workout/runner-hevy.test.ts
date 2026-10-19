import { describe, expect, it } from "vitest";
import {
  buildPayload,
  completeSet,
  createDraft,
  setExerciseRestSeconds,
  setSkipped,
  summarize,
  toggleWarmup,
  updateSetField,
  workoutVolume,
} from "./runner-state";
import { loadDraft, saveDraft, type DraftStorage } from "./draft";
import { restAfterSet } from "@/domain/rest-timer";

const now = new Date("2026-10-19T15:00:00Z");
const create = () =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId: "student",
    plannedSession: { id: "session", programId: "program", label: "A" },
    now,
    exercises: [
      {
        sessionExerciseId: "se1",
        exerciseId: "ex1",
        name: "Sentadilla",
        isBodyweight: false,
        prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 62.5 },
        lastWeightKg: null,
      },
      {
        sessionExerciseId: "se2",
        exerciseId: "ex2",
        name: "Dominadas",
        isBodyweight: true,
        prescribed: { sets: 1, repsMin: 6, repsMax: 10, targetWeightKg: null },
        lastWeightKg: null,
      },
    ],
  });

describe("volumen durante el entrenamiento", () => {
  it("solo cuenta series hechas y separa repeticiones sin carga", () => {
    let d = create();
    expect(workoutVolume(d)).toEqual({ loadKg: 0, bodyweightReps: 0 });
    d = completeSet(d, 0, 0, null).draft;
    d = completeSet(d, 1, 0, null).draft;
    expect(workoutVolume(d)).toEqual({ loadKg: 500, bodyweightReps: 6 });
    d = updateSetField(d, 0, 0, "reps", "10");
    expect(workoutVolume(d).loadKg).toBe(625);
    d = completeSet(d, 0, 0, null).draft;
    expect(workoutVolume(d).loadKg).toBe(0);
  });

  it("excluye calentamientos, saltados y datos inválidos recuperados", () => {
    const d = completeSet(create(), 0, 0, null).draft;
    expect(workoutVolume(toggleWarmup(d, 0, 0)).loadKg).toBe(0);
    expect(workoutVolume(setSkipped(d, 0, true)).loadKg).toBe(0);
    d.exercises[0].sets[0].reps = "no válido";
    expect(workoutVolume(d).loadKg).toBe(0);
  });
});

describe("editar una serie hecha", () => {
  it.each(["", "0", "101"])("repeticiones inválidas %s desmarcan sin perder el texto", (value) => {
    const original = completeSet(create(), 0, 0, null).draft;
    const d = updateSetField(original, 0, 0, "reps", value);
    expect(d.exercises[0].sets[0]).toMatchObject({ done: false, reps: value });
    expect(original.exercises[0].sets[0]).toMatchObject({ done: true, reps: "8" });
    expect(summarize(d).doneSets).toBe(0);
    expect(buildPayload(d, now).ok).toBe(false);
  });

  it.each(["", "501", "-1"])("peso inválido %s desmarca en un ejercicio con carga", (value) => {
    const d = updateSetField(completeSet(create(), 0, 0, null).draft, 0, 0, "weight", value);
    expect(d.exercises[0].sets[0].done).toBe(false);
  });

  it("peso vacío es válido para peso corporal y la edición válida conserva la marca", () => {
    let d = completeSet(create(), 1, 0, null).draft;
    d = updateSetField(d, 1, 0, "weight", "");
    d = updateSetField(d, 1, 0, "reps", "9");
    expect(d.exercises[1].sets[0].done).toBe(true);
    expect(workoutVolume(d).bodyweightReps).toBe(9);
  });
});

describe("descanso por ejercicio", () => {
  it("la selección solo afecta al ejercicio elegido y a los próximos descansos", () => {
    const original = create();
    const d = setExerciseRestSeconds(original, 0, 120);
    expect(d.exercises[0].restSeconds).toBe(120);
    expect(d.exercises[1]).toEqual(original.exercises[1]);
    expect(original.exercises[0].restSeconds).toBeUndefined();
    expect(restAfterSet(1000, false, d.exercises[0].restSeconds)).toEqual({
      endsAt: 121000,
      totalSeconds: 120,
    });
    expect(restAfterSet(1000, true, 120)?.totalSeconds).toBe(60);
    expect(restAfterSet(1000, false)?.totalSeconds).toBe(90);
    expect(restAfterSet(1000, false, 0)).toBeNull();
    expect(restAfterSet(1000, true, 0)).toBeNull();
    expect(setExerciseRestSeconds(d, 0, -1)).toBe(d);
    expect(setExerciseRestSeconds(d, 0, 601)).toBe(d);
    expect(setExerciseRestSeconds(d, 0, 30.5)).toBe(d);
  });

  it("recupera la selección y sigue aceptando borradores anteriores sin ese campo", () => {
    let raw: string | null = null;
    const storage: DraftStorage = {
      length: 1,
      key: () => "",
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value;
      },
      removeItem: () => {
        raw = null;
      },
    };
    saveDraft(storage, create());
    expect(loadDraft(storage, "student", "session")?.exercises[0].restSeconds).toBeUndefined();
    saveDraft(storage, setExerciseRestSeconds(create(), 0, 180));
    expect(loadDraft(storage, "student", "session")?.exercises[0].restSeconds).toBe(180);
  });
});
