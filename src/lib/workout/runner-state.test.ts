import { describe, expect, it } from "vitest";
import {
  addSet,
  setExerciseRestSeconds,
  buildPayload,
  canComplete,
  createDraft,
  finishDraft,
  removeSet,
  setSkipped,
  summarize,
  toggleDone,
  toggleWarmup,
  updateSetField,
  type PrefillExercise,
} from "./runner-state";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";

const squat: PrefillExercise = {
  sessionExerciseId: "se-1",
  exerciseId: "ex-1",
  name: "Sentadilla",
  isBodyweight: false,
  prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
  lastWeightKg: 55,
};
const pullUp: PrefillExercise = {
  sessionExerciseId: "se-2",
  exerciseId: "ex-2",
  name: "Dominadas",
  isBodyweight: true,
  prescribed: { sets: 2, repsMin: 5, repsMax: 8, targetWeightKg: null },
  lastWeightKg: null,
};
const bench: PrefillExercise = {
  sessionExerciseId: "se-3",
  exerciseId: "ex-3",
  name: "Press de banca",
  isBodyweight: false,
  prescribed: { sets: 3, repsMin: 6, repsMax: 8, targetWeightKg: null },
  lastWeightKg: 70,
};

const create = (exercises = [squat, pullUp, bench]) =>
  createDraft({
    workoutId: UUID,
    userId: "user-a",
    plannedSession: { id: "session-1", programId: "program-1", label: "A" },
    exercises,
    now: NOW,
  });

describe("createDraft (DC-9: precarga de pesos)", () => {
  it("crea tantas series como las prescritas, sin completar y sin repeticiones", () => {
    const draft = create();
    expect(draft.status).toBe("in_progress");
    expect(draft.workoutId).toBe(UUID);
    expect(draft.startedAt).toBe(NOW.toISOString());
    expect(draft.exercises.map((e) => e.sets.length)).toEqual([3, 2, 3]);
    expect(
      draft.exercises.flatMap((e) => e.sets).every((s) => !s.done && s.reps === "" && !s.isWarmup),
    ).toBe(true);
  });

  it("usa el peso prescrito si existe; si no, el último usado; si no hay ninguno, vacío", () => {
    const draft = create();
    expect(draft.exercises[0].sets.map((s) => s.weight)).toEqual(["60", "60", "60"]); // prescrito (no el 55 usado)
    expect(draft.exercises[1].sets.map((s) => s.weight)).toEqual(["", ""]); // sin prescrito ni historial
    expect(draft.exercises[2].sets.map((s) => s.weight)).toEqual(["70", "70", "70"]); // último usado
  });

  it("escribe los decimales con coma y sin ceros sobrantes", () => {
    const draft = create([{ ...squat, prescribed: { ...squat.prescribed, targetWeightKg: 62.5 } }]);
    expect(draft.exercises[0].sets[0].weight).toBe("62,5");
  });

  it("asigna ids de serie únicos", () => {
    const ids = create().exercises.flatMap((e) => e.sets.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("edición de series (RF-21, RF-26)", () => {
  it("escribe peso y repeticiones sin mutar el borrador original", () => {
    const original = create();
    const next = updateSetField(
      updateSetField(original, 0, 0, "weight", "62,5"),
      0,
      0,
      "reps",
      "10",
    );
    expect(next.exercises[0].sets[0]).toMatchObject({ weight: "62,5", reps: "10" });
    expect(original.exercises[0].sets[0]).toMatchObject({ weight: "60", reps: "" });
  });

  it("no se puede completar una serie sin repeticiones", () => {
    const draft = create();
    expect(canComplete(draft.exercises[0], draft.exercises[0].sets[0])).toBe(false);
    expect(toggleDone(draft, 0, 0)).toEqual(draft);
  });

  it("completa con repeticiones y peso, y se puede desmarcar", () => {
    let draft = updateSetField(create(), 0, 0, "reps", "10");
    draft = toggleDone(draft, 0, 0);
    expect(draft.exercises[0].sets[0].done).toBe(true);
    draft = toggleDone(draft, 0, 0);
    expect(draft.exercises[0].sets[0].done).toBe(false);
  });

  it("exige peso salvo en ejercicios de peso corporal", () => {
    let draft = updateSetField(create(), 1, 0, "reps", "6");
    expect(canComplete(draft.exercises[1], draft.exercises[1].sets[0])).toBe(true); // dominadas: peso corporal
    draft = updateSetField(draft, 0, 0, "weight", "");
    draft = updateSetField(draft, 0, 0, "reps", "8");
    expect(canComplete(draft.exercises[0], draft.exercises[0].sets[0])).toBe(false); // sentadilla sin peso
  });

  it("rechaza repeticiones y pesos fuera de rango al completar", () => {
    let draft = updateSetField(create(), 0, 0, "reps", "0");
    expect(canComplete(draft.exercises[0], draft.exercises[0].sets[0])).toBe(false);
    draft = updateSetField(draft, 0, 0, "reps", "101");
    expect(canComplete(draft.exercises[0], draft.exercises[0].sets[0])).toBe(false);
    draft = updateSetField(draft, 0, 0, "reps", "5");
    draft = updateSetField(draft, 0, 0, "weight", "501");
    expect(canComplete(draft.exercises[0], draft.exercises[0].sets[0])).toBe(false);
  });

  it("agrega una serie extra copiando el peso de la anterior", () => {
    const draft = addSet(create(), 0);
    expect(draft.exercises[0].sets).toHaveLength(4);
    expect(draft.exercises[0].sets[3]).toMatchObject({
      weight: "60",
      reps: "",
      done: false,
      isWarmup: false,
    });
  });

  it("quita una serie, también la última", () => {
    let draft = create();
    draft = removeSet(draft, 0, 1);
    expect(draft.exercises[0].sets).toHaveLength(2);
    draft = removeSet(removeSet(draft, 0, 0), 0, 0);
    expect(draft.exercises[0].sets).toHaveLength(0);
  });

  it("marca una serie como calentamiento", () => {
    const draft = toggleWarmup(create(), 0, 0);
    expect(draft.exercises[0].sets[0].isWarmup).toBe(true);
    expect(toggleWarmup(draft, 0, 0).exercises[0].sets[0].isWarmup).toBe(false);
  });

  it("saltar un ejercicio lo excluye al guardar, sin borrar lo escrito", () => {
    let draft = updateSetField(create(), 0, 0, "reps", "10");
    draft = toggleDone(draft, 0, 0);
    draft = setSkipped(draft, 0, true);
    expect(draft.exercises[0].skipped).toBe(true);
    expect(draft.exercises[0].sets[0].done).toBe(true);
    expect(buildPayload(draft, NOW)).toEqual({ ok: false, reason: "no_sets" });
  });
});

describe("summarize", () => {
  it("cuenta series completadas y totales de los ejercicios no saltados", () => {
    let draft = updateSetField(create(), 0, 0, "reps", "10");
    draft = toggleDone(draft, 0, 0);
    expect(summarize(draft)).toEqual({ doneSets: 1, totalSets: 8, skippedExercises: 0 });
    expect(summarize(setSkipped(draft, 2, true))).toEqual({
      doneSets: 1,
      totalSets: 5,
      skippedExercises: 1,
    });
  });
});

describe("buildPayload (RF-23: guardar solo series completadas)", () => {
  function filled() {
    let draft = create();
    draft = updateSetField(draft, 0, 0, "reps", "10");
    draft = toggleDone(draft, 0, 0);
    draft = updateSetField(draft, 0, 1, "weight", "62,5");
    draft = updateSetField(draft, 0, 1, "reps", "8");
    draft = toggleDone(draft, 0, 1);
    draft = updateSetField(draft, 1, 0, "reps", "6");
    draft = toggleDone(draft, 1, 0); // dominadas: peso corporal
    return draft;
  }

  it("incluye solo las series completadas, con números ya convertidos y la posición del ejercicio", () => {
    const result = buildPayload(filled(), new Date("2026-10-07T16:00:00.000Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      id: UUID,
      programId: "program-1",
      programSessionId: "session-1",
      sessionLabel: "A",
      startedAt: "2026-10-07T15:00:00.000Z",
      finishedAt: "2026-10-07T16:00:00.000Z",
      durationSeconds: 3600,
    });
    expect(result.payload.sets).toEqual([
      {
        sessionExerciseId: "se-1",
        prescribedExerciseId: "ex-1",
        exerciseId: "ex-1",
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 1,
        weightKg: 60,
        reps: 10,
        isWarmup: false,
      },
      {
        sessionExerciseId: "se-1",
        prescribedExerciseId: "ex-1",
        exerciseId: "ex-1",
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 2,
        weightKg: 62.5,
        reps: 8,
        isWarmup: false,
      },
      {
        sessionExerciseId: "se-2",
        prescribedExerciseId: "ex-2",
        exerciseId: "ex-2",
        exerciseName: "Dominadas",
        position: 1,
        setNumber: 1,
        weightKg: 0,
        reps: 6,
        isWarmup: false,
      },
    ]);
  });

  it("numera las series de cada ejercicio de corrido aunque se hayan saltado algunas", () => {
    let draft = updateSetField(create(), 0, 2, "reps", "9");
    draft = toggleDone(draft, 0, 2); // solo la 3ª serie completada
    const result = buildPayload(draft, NOW);
    if (!result.ok) throw new Error("debía armar el payload");
    expect(result.payload.sets.map((s) => s.setNumber)).toEqual([1]);
  });

  it("conserva el calentamiento marcado", () => {
    let draft = toggleWarmup(updateSetField(create(), 0, 0, "reps", "10"), 0, 0);
    draft = toggleDone(draft, 0, 0);
    const result = buildPayload(draft, NOW);
    if (!result.ok) throw new Error("debía armar el payload");
    expect(result.payload.sets[0].isWarmup).toBe(true);
  });

  it("sin ninguna serie completada no hay nada que guardar", () => {
    expect(buildPayload(create(), NOW)).toEqual({ ok: false, reason: "no_sets" });
  });

  it("la duración nunca es negativa", () => {
    const result = buildPayload(filled(), new Date("2026-10-07T14:00:00.000Z"));
    if (!result.ok) throw new Error("debía armar el payload");
    expect(result.payload.durationSeconds).toBe(0);
  });
});

describe("finishDraft (RF-24)", () => {
  it("marca el borrador como pendiente de guardar con su duración, conservando el id", () => {
    const finished = finishDraft(create(), new Date("2026-10-07T15:45:30.000Z"));
    expect(finished).toMatchObject({
      status: "pending_save",
      workoutId: UUID,
      finishedAt: "2026-10-07T15:45:30.000Z",
      durationSeconds: 2730,
    });
  });
});

describe("prescripciones de descanso y grupos (T147)", () => {
  it("precarga metadatos y ajusta solo el descanso compartido del entrenamiento", () => {
    const draft = create([
      { ...squat, restSeconds: 45, supersetId: "g", supersetRestSeconds: 120 },
      { ...pullUp, restSeconds: 30, supersetId: "g", supersetRestSeconds: 120 },
      bench,
    ]);
    expect(draft.exercises[0]).toMatchObject({
      restSeconds: 45,
      supersetId: "g",
      supersetRestSeconds: 120,
    });
    const updated = setExerciseRestSeconds(draft, 1, 0);
    expect(updated.exercises.slice(0, 2).map((e) => e.supersetRestSeconds)).toEqual([0, 0]);
    expect(updated.exercises[0].restSeconds).toBe(45);
    expect(updated.exercises[2]).toEqual(draft.exercises[2]);
  });
});
