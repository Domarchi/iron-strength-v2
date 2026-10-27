import { expect, it } from "vitest";
import { typedResultFixture } from "../../../src/test/fixtures/typed-result";
import { prepareTypedWorkoutRepeat } from "../../../src/domain/typed-workout-repeat";
import { createTypedRepeatedTraining } from "./typed-repeat-training";
import { buildTypedRecording } from "./typed-training";
const id = (n: number) => `be215000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup() {
  const { result, catalog } = typedResultFixture(),
    prepared = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  if (!prepared.ok) throw Error(prepared.message);
  let n = 2000;
  return {
    result,
    plan: prepared.plan,
    input: { userId: id(1), workoutId: id(1000), now: new Date("2026-10-27T15:00:00Z") },
    uuid: () => id(n++),
  };
}
it("crea una copia libre con métricas pendientes, clases conservadas y todas sus identidades nuevas", () => {
  const x = setup();
  x.plan.exercises[0].sets[0].setType = "warmup";
  x.plan.exercises[1].sets[0].setType = "failure";
  x.plan.exercises[2].sets[0].setType = "drop";
  const before = JSON.stringify(x.plan),
    next = createTypedRepeatedTraining(x.plan, x.input, x.uuid);
  expect(JSON.stringify(x.plan)).toBe(before);
  expect(next.routine).toMatchObject({
    version: 3,
    origin: { kind: "free" },
    title: x.plan.title,
    sessionLabel: "Libre",
  });
  expect(next.draft).toMatchObject({
    version: 4,
    workoutId: x.input.workoutId,
    startedAt: x.input.now.toISOString(),
    rest: null,
    status: "in_progress",
  });
  for (const [i, e] of next.draft.exercises.entries()) {
    expect(e.sessionExerciseId).not.toBe(x.plan.exercises[i].sourceRowId);
    expect(e.athleteNote).toBeNull();
    const s = e.sets[0];
    expect(s.id).not.toBe(x.plan.exercises[i].sets[0].id);
    expect(s.done).toBe(false);
    expect(s.effort).toBe("");
    expect(s.setType).toBe(x.plan.exercises[i].sets[0].setType);
    const m = x.plan.exercises[i].sets[0].metrics;
    expect(s).toMatchObject({
      weight: m.weightKg === null ? "" : String(m.weightKg).replace(".", ","),
      reps: m.reps === null ? "" : String(m.reps),
      duration: m.durationSeconds === null ? "" : String(m.durationSeconds),
      distance: m.distanceMeters === null ? "" : String(m.distanceMeters).replace(".", ","),
    });
  }
  expect(next.draft).not.toHaveProperty("perceivedEffort");
  expect(next.draft).not.toHaveProperty("note");
});
it("regenera grupos, conserva descansos y permite cerrar sin arrastrar notas/esfuerzo del origen", () => {
  const x = setup(),
    oldGroup = id(999);
  for (let i = 0; i < 2; i++)
    Object.assign(x.plan.exercises[i], { supersetId: oldGroup, supersetRestSeconds: 0 });
  const next = createTypedRepeatedTraining(x.plan, x.input, x.uuid);
  expect(next.routine.exercises[0].supersetId).not.toBe(oldGroup);
  expect(next.routine.exercises[0].supersetId).toBe(next.routine.exercises[1].supersetId);
  expect(next.routine.exercises[0].supersetRestSeconds).toBe(0);
  next.draft.exercises.forEach((e) =>
    e.sets.forEach((s) => {
      s.done = true;
    }),
  );
  const built = buildTypedRecording(next.routine, next.draft, new Date("2026-10-27T15:01:00Z"));
  if (!built.ok) throw Error(built.reason);
  const p = built.payload;
  expect(p.source).toBe("free");
  expect(p.workout.exerciseNotes.every((n) => n.note === null)).toBe(true);
  expect(p.workout.sets.every((s) => s.effort === null)).toBe(true);
});
it("IDs repetidos o del resultado original y planes manipulados se rechazan antes de producir un registro", () => {
  const x = setup();
  expect(() =>
    createTypedRepeatedTraining(x.plan, { ...x.input, workoutId: x.plan.sourceWorkoutId }, x.uuid),
  ).toThrow();
  expect(() =>
    createTypedRepeatedTraining(x.plan, x.input, () => x.plan.exercises[0].sourceRowId),
  ).toThrow();
  expect(() => createTypedRepeatedTraining(x.plan, x.input, () => id(2000))).toThrow();
  const bad = { ...x.plan, version: 99 };
  expect(() =>
    createTypedRepeatedTraining(bad as unknown as typeof x.plan, x.input, x.uuid),
  ).toThrow();
});
