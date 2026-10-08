import { describe, expect, it } from "vitest";
import {
  completeSet,
  copyPrevious,
  createDraft,
  exerciseProgress,
  isExerciseComplete,
  previousForSet,
  toggleWarmup,
  updateSetField,
  type PrefillExercise,
} from "./runner-state";

const squat: PrefillExercise = {
  sessionExerciseId: "se-1",
  exerciseId: "ex-1",
  name: "Sentadilla",
  isBodyweight: false,
  prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
  lastWeightKg: 55,
};

const draft = () =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId: "u",
    plannedSession: { id: "s", programId: "p", label: "A" },
    exercises: [squat],
    now: new Date("2026-10-07T15:00:00.000Z"),
  });

const last = {
  sets: [
    { weightKg: 40, reps: 12, isWarmup: true },
    { weightKg: 65, reps: 10, isWarmup: false },
    { weightKg: 62.5, reps: 9, isWarmup: false },
  ],
};

describe("previousForSet (RF-53)", () => {
  it("la serie de trabajo n usa la serie de trabajo n de la última vez", () => {
    const ex = draft().exercises[0];
    expect(previousForSet(last, ex, 0)).toEqual({ weightKg: 65, reps: 10 });
    expect(previousForSet(last, ex, 1)).toEqual({ weightKg: 62.5, reps: 9 });
  });

  it("no hay anterior si la última vez tuvo menos series o no existe", () => {
    const ex = draft().exercises[0];
    expect(previousForSet(last, ex, 2)).toBeNull();
    expect(previousForSet(null, ex, 0)).toBeNull();
  });

  it("un calentamiento se compara con los calentamientos, y no desplaza el índice de las series de trabajo", () => {
    const withWarmup = toggleWarmup(draft(), 0, 0); // la serie 1 pasa a calentamiento
    const ex = withWarmup.exercises[0];
    expect(previousForSet(last, ex, 0)).toEqual({ weightKg: 40, reps: 12 });
    expect(previousForSet(last, ex, 1)).toEqual({ weightKg: 65, reps: 10 });
    expect(previousForSet(last, ex, 2)).toEqual({ weightKg: 62.5, reps: 9 });
  });
});

describe("copyPrevious (RF-54)", () => {
  it("copia peso (con coma) y repeticiones a la fila", () => {
    const next = copyPrevious(draft(), 0, 1, { weightKg: 62.5, reps: 9 });
    expect(next.exercises[0].sets[1]).toMatchObject({ weight: "62,5", reps: "9", done: false });
  });
});

describe("completeSet (RF-55, DC-27)", () => {
  it("rellena las repeticiones con las de 'anterior' y marca la serie", () => {
    const result = completeSet(draft(), 0, 0, { weightKg: 65, reps: 10 });
    expect(result.completed).toBe(true);
    expect(result.draft.exercises[0].sets[0]).toMatchObject({ weight: "60", reps: "10", done: true });
  });

  it("sin 'anterior', usa las repeticiones mínimas prescritas", () => {
    const result = completeSet(draft(), 0, 0, null);
    expect(result.draft.exercises[0].sets[0]).toMatchObject({ reps: "8", done: true });
  });

  it("respeta lo que el alumno ya escribió", () => {
    const typed = updateSetField(draft(), 0, 0, "reps", "11");
    const result = completeSet(typed, 0, 0, { weightKg: 65, reps: 10 });
    expect(result.draft.exercises[0].sets[0].reps).toBe("11");
  });

  it("rellena un peso vacío con el de 'anterior'", () => {
    const empty = updateSetField(draft(), 0, 0, "weight", "");
    const result = completeSet(empty, 0, 0, { weightKg: 65, reps: 10 });
    expect(result.draft.exercises[0].sets[0].weight).toBe("65");
  });

  it("no marca si no hay un peso válido (ni escrito ni de referencia)", () => {
    const empty = updateSetField(draft(), 0, 0, "weight", "");
    const result = completeSet(empty, 0, 0, null);
    expect(result.completed).toBe(false);
    expect(result.draft.exercises[0].sets[0].done).toBe(false);
  });

  it("marcar una serie hecha la desmarca y no es un 'completado' (RF-60: sin descanso)", () => {
    const done = completeSet(draft(), 0, 0, null).draft;
    const undone = completeSet(done, 0, 0, null);
    expect(undone.completed).toBe(false);
    expect(undone.draft.exercises[0].sets[0].done).toBe(false);
  });

  it("informa si lo marcado fue un calentamiento (para elegir el descanso)", () => {
    const warm = toggleWarmup(draft(), 0, 0);
    expect(completeSet(warm, 0, 0, null).wasWarmup).toBe(true);
    expect(completeSet(draft(), 0, 0, null).wasWarmup).toBe(false);
  });
});

describe("progreso del ejercicio (RF-56)", () => {
  it("cuenta series hechas y detecta el ejercicio completo", () => {
    let d = draft();
    expect(exerciseProgress(d.exercises[0])).toEqual({ done: 0, total: 3 });
    expect(isExerciseComplete(d.exercises[0])).toBe(false);
    for (const i of [0, 1, 2]) d = completeSet(d, 0, i, null).draft;
    expect(exerciseProgress(d.exercises[0])).toEqual({ done: 3, total: 3 });
    expect(isExerciseComplete(d.exercises[0])).toBe(true);
  });

  it("un ejercicio sin series no está completo", () => {
    const d = draft();
    expect(isExerciseComplete({ ...d.exercises[0], sets: [] })).toBe(false);
  });
});
