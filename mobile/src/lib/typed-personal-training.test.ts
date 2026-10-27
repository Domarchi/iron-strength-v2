import { expect, it } from "vitest";
import { typedResultFixture } from "../../../src/test/fixtures/typed-result";
import { prepareTypedWorkoutRoutine } from "../../../src/domain/typed-workout-routine";
import { typedPersonalItemsInput } from "../../../src/domain/typed-personal-routines";
import { personalRoutineTrainingContext } from "./typed-personal-training";
import { createTypedDraft } from "./typed-training";
const base = () => {
  const { result, catalog } = typedResultFixture(),
    p = prepareTypedWorkoutRoutine(result.workout, catalog.exercises);
  if (!p.ok) throw Error(p.message);
  return {
    id: result.workout.id,
    name: "Base",
    folderId: null,
    revision: 3,
    position: 0,
    createdAt: result.workout.startedAt,
    updatedAt: result.workout.startedAt,
    items: typedPersonalItemsInput(p.items).map((r, i) => ({
      ...r,
      ...catalog.exercises[i],
      id: r.id,
      position: i,
    })),
  };
};
it("consulta todos los objetivos sin iniciar reloj y crea registro3 solo al confirmar", () => {
  const routine = base(),
    before = JSON.stringify(routine),
    context = personalRoutineTrainingContext(routine);
  expect(context.version).toBe(3);
  if (context.version !== 3) throw Error("fixture");
  expect(context.origin).toEqual({ kind: "personal", routineId: routine.id, revision: 3 });
  expect(context.exercises.map((r) => r.prescribed)).toEqual(
    routine.items.map((r) => r.prescribed),
  );
  const draft = createTypedDraft({
    context,
    userId: "af215000-0000-4000-8000-000000000001",
    workoutId: "af215000-0000-4000-8000-000000000002",
    now: new Date("2026-10-27T15:00:00Z"),
  });
  expect(draft.exercises[5].sets[0]).toMatchObject({
    reps: "",
    duration: "",
    distance: "",
    done: false,
    effort: "",
  });
  expect(JSON.stringify(routine)).toBe(before);
});
it("mantiene el inicio legado null y rechaza bases vacías o incompatibles", () => {
  const routine = base();
  routine.items = routine.items.slice(0, 1);
  expect(personalRoutineTrainingContext(routine).version).toBe(2);
  expect(() => personalRoutineTrainingContext({ ...routine, items: [] })).toThrow();
  routine.items[0].prescribed.target.repsMin = null;
  expect(() => personalRoutineTrainingContext(routine)).toThrow();
});
it("las indicaciones Unicode que exceden el contenedor anterior usan contexto3 íntegro", () => {
  const routine = base();
  routine.items = routine.items.slice(0, 1);
  routine.items[0].note = "🏋".repeat(500);
  const context = personalRoutineTrainingContext(routine);
  expect(context.version).toBe(3);
  expect(context.exercises[0].note).toBe(routine.items[0].note);
});
