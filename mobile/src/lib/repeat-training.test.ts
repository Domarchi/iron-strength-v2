import { describe, expect, it, vi } from "vitest";
import { createRepeatedTraining } from "./repeat-training";
import { prepareWorkoutRepeat } from "../../../src/domain/workout-repeat";
import { repeatWorkoutFixture } from "../../../src/test/fixtures/repeat-workout";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-27T14:00:00Z");
function setup() {
  const { workout, catalog } = repeatWorkoutFixture();
  const result = prepareWorkoutRepeat(workout, catalog);
  if (!result.ok) throw Error("fixture");
  let n = 5000;
  const uuid = vi.fn(() => id(n++));
  return {
    workout,
    catalog,
    plan: result.plan,
    uuid,
    input: { userId: id(9000), workoutId: id(9001), now },
  };
}
describe("crear una sesión independiente desde una vista previa", () => {
  it("copia valores y objetivos sin series hechas, tiempos/recibos o programa anterior", () => {
    const x = setup(),
      before = structuredClone(x.plan),
      next = createRepeatedTraining(x.plan, x.input, x.uuid);
    expect(next.routine).toMatchObject({
      version: 2,
      origin: { kind: "free" },
      session: { id: null, programId: null, label: "Libre", title: "Superior" },
    });
    expect(next.draft).toMatchObject({
      version: 3,
      userId: x.input.userId,
      workoutId: x.input.workoutId,
      programId: null,
      plannedSessionId: null,
      status: "in_progress",
      startedAt: now.toISOString(),
    });
    for (const key of [
      "rest",
      "finishedAt",
      "durationSeconds",
      "perceivedEffort",
      "note",
      "payload",
    ])
      expect(next.draft).not.toHaveProperty(key);
    expect(next.draft.exercises[0].sets).toMatchObject([
      { weight: "30", reps: "8", done: false, isWarmup: false },
    ]);
    expect(next.draft.exercises[0].sets).toHaveLength(1);
    expect(next.routine.exercises[0].prescribed).toEqual(x.plan.exercises[0].prescribed);
    expect(next.routine.exercises[0].note).toBe("Controlado");
    expect(x.plan).toEqual(before);
  });
  it("regenera identidad de filas, grupos y series, manteniendo el ejercicio global y descanso", () => {
    const x = setup(),
      next = createRepeatedTraining(x.plan, x.input, x.uuid),
      originalGroup = x.plan.exercises[0].supersetId;
    expect(next.routine.exercises[0].exerciseId).toBe(x.plan.exercises[0].exerciseId);
    expect(next.routine.exercises[0].sessionExerciseId).not.toBe(x.plan.exercises[0].sourceRowId);
    const groups = next.routine.exercises.map((e) => e.supersetId);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[0]).not.toBe(originalGroup);
    expect(next.draft.exercises[0].sets[0].id).not.toBe(x.plan.exercises[0].sets[0].id);
    expect(next.draft.exercises[0].supersetRestSeconds).toBe(60);
    expect(new Set(next.draft.exercises.map((e) => e.sessionExerciseId)).size).toBe(2);
  });
  it("recupera los veinte valores y calentamientos, con coma decimal y objetivos independientes", () => {
    const { workout, catalog } = repeatWorkoutFixture();
    workout.exercises[0].sets = Array.from({ length: 20 }, (_, i) => ({
      id: id(2000 + i),
      setNumber: i + 1,
      weightKg: 10.5,
      reps: 8,
      isWarmup: i === 0,
    }));
    const p = prepareWorkoutRepeat(workout, catalog);
    if (!p.ok) throw Error("fixture");
    let n = 5000;
    const next = createRepeatedTraining(
      p.plan,
      { userId: id(9000), workoutId: id(9001), now },
      () => id(n++),
    );
    expect(next.draft.exercises[0].sets).toHaveLength(20);
    expect(next.draft.exercises[0].sets[0]).toMatchObject({
      weight: "10,5",
      isWarmup: true,
      done: false,
    });
    expect(next.draft.exercises.every((e) => e.sets.every((s) => !s.done))).toBe(true);
    next.draft.exercises[0].prescribed.targetWeightKg = 99;
    expect(p.plan.exercises[0].prescribed.targetWeightKg).toBe(30);
  });
  it("un ID de resultado o generador repetido nunca se acepta como identidad nueva", () => {
    const x = setup();
    expect(() =>
      createRepeatedTraining(x.plan, { ...x.input, workoutId: x.plan.sourceWorkoutId }, x.uuid),
    ).toThrow();
    expect(x.uuid).not.toHaveBeenCalled();
    expect(() => createRepeatedTraining(x.plan, x.input, () => id(5000))).toThrow();
  });
  it("una vista previa adulterada se valida antes de crear filas", () => {
    const x = setup(),
      invalid = structuredClone(x.plan);
    invalid.exercises[0].prescribed.sets = 11;
    expect(() => createRepeatedTraining(invalid, x.input, x.uuid)).toThrow();
    expect(x.uuid).not.toHaveBeenCalled();
  });
});
