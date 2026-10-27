import { expect, it } from "vitest";
import { typedResultFixture } from "../test/fixtures/typed-result";
import { prepareTypedWorkoutRepeat, typedRepeatPlanSchema } from "./typed-workout-repeat";
const groupId = "be215000-0000-4000-8000-000000000999";
it("prepara todos los tipos desde el resultado completo sin esfuerzo ni notas propias y sin mutarlo", () => {
  const { result, catalog } = typedResultFixture(),
    before = JSON.stringify(result);
  result.workout.exercises[0].sets[0].setType = "warmup";
  result.workout.exercises[1].sets[0].setType = "failure";
  result.workout.exercises[2].sets[0].setType = "drop";
  const immutable = JSON.stringify(result),
    prepared = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  expect(before).not.toBe(immutable);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw Error(prepared.message);
  expect(prepared.plan.exercises).toHaveLength(9);
  expect(prepared.plan.exercises.map((e) => e.sets[0].metrics)).toEqual(
    result.workout.exercises.map((e) => e.sets[0].metrics),
  );
  expect(prepared.plan.exercises.slice(0, 3).map((e) => e.sets[0].setType)).toEqual([
    "warmup",
    "failure",
    "drop",
  ]);
  expect(prepared.plan.warnings).toContain("warmups_only");
  expect(prepared.plan.exercises[0].note).toBe("Indicación 0");
  expect(JSON.stringify(prepared.plan)).not.toContain("Nota propia");
  expect(JSON.stringify(prepared.plan)).not.toContain("Nota global");
  expect(JSON.stringify(prepared.plan)).not.toContain("effort");
  expect(JSON.stringify(result)).toBe(immutable);
});
it("solo incluye posiciones realizadas, disuelve el grupo huérfano y conserva el descanso de ronda", () => {
  const { result, catalog } = typedResultFixture();
  for (let i = 0; i < 2; i++) {
    Object.assign(result.workout.structure.exercises[i], {
      supersetId: groupId,
      supersetRestSeconds: 60,
    });
    Object.assign(result.workout.exercises[i], { supersetId: groupId, supersetRestSeconds: 60 });
  }
  result.workout.exercises[1].sets = [];
  const p = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  expect(p.ok).toBe(true);
  if (!p.ok) throw Error(p.message);
  expect(p.plan.exercises.map((e) => e.sourcePosition)).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
  expect(p.plan.warnings).toEqual(["unperformed", "incomplete_group"]);
  expect(p.plan.exercises[0]).toMatchObject({
    supersetId: null,
    supersetRestSeconds: null,
    restSeconds: 60,
  });
});
it("conserva grupos realizados y objetivos por serie sin consultar la base actual", () => {
  const { result, catalog } = typedResultFixture();
  for (let i = 0; i < 2; i++) {
    Object.assign(result.workout.structure.exercises[i], {
      supersetId: groupId,
      supersetRestSeconds: 0,
    });
    Object.assign(result.workout.exercises[i], { supersetId: groupId, supersetRestSeconds: 0 });
  }
  const rx = result.workout.structure.exercises[5].prescribed;
  rx.series = [{ ...rx.target }];
  result.workout.exercises[5].prescribed = structuredClone(rx);
  const p = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  expect(p.ok).toBe(true);
  if (!p.ok) throw Error(p.message);
  expect(p.plan.exercises[0].supersetRestSeconds).toBe(0);
  expect(p.plan.exercises[1].supersetId).toBe(groupId);
  expect(p.plan.exercises[5].prescribed).toEqual(rx);
});
it("grupo disuelto sin descanso prescrito usa los90s habituales, nunca el descanso individual de cero", () => {
  const { result, catalog } = typedResultFixture();
  for (let i = 0; i < 2; i++) {
    Object.assign(result.workout.structure.exercises[i], {
      supersetId: groupId,
      supersetRestSeconds: null,
      restSeconds: 0,
    });
    Object.assign(result.workout.exercises[i], {
      supersetId: groupId,
      supersetRestSeconds: null,
      restSeconds: 0,
    });
  }
  result.workout.exercises[1].sets = [];
  const p = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  if (!p.ok) throw Error(p.message);
  expect(p.plan.exercises[0]).toMatchObject({
    supersetId: null,
    supersetRestSeconds: null,
    restSeconds: 90,
  });
});
it("ejercicio ausente o con tipo diferente bloquea la copia completa sin inventar dimensiones", () => {
  const { result, catalog } = typedResultFixture();
  expect(prepareTypedWorkoutRepeat(result.workout, catalog.exercises.slice(1))).toMatchObject({
    ok: false,
    reason: "unavailable",
  });
  catalog.exercises[5].recordType = "weight_reps";
  expect(prepareTypedWorkoutRepeat(result.workout, catalog.exercises)).toMatchObject({
    ok: false,
    reason: "unavailable",
  });
});
it("resultado sin series, métricas incoherentes y series duplicadas no generan planes parciales", () => {
  const { result, catalog } = typedResultFixture();
  result.workout.exercises[0].sets.push({ ...result.workout.exercises[0].sets[0] });
  expect(prepareTypedWorkoutRepeat(result.workout, catalog.exercises)).toMatchObject({
    ok: false,
    reason: "invalid",
  });
  result.workout.exercises[0].sets.pop();
  result.workout.exercises[5].sets[0].metrics.recordType = "weight_duration";
  expect(prepareTypedWorkoutRepeat(result.workout, catalog.exercises)).toMatchObject({
    ok: false,
    reason: "invalid",
  });
  result.workout.exercises.forEach((e) => {
    e.sets = [];
  });
  expect(prepareTypedWorkoutRepeat(result.workout, catalog.exercises)).toMatchObject({
    ok: false,
    reason: "no_sets",
  });
});
it("el contrato del plan es cerrado y rechaza esfuerzo propio o dimensiones ajenas ocultas", () => {
  const { result, catalog } = typedResultFixture(),
    p = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  if (!p.ok) throw Error(p.message);
  expect(typedRepeatPlanSchema.safeParse({ ...p.plan, effort: 9 }).success).toBe(false);
  const changed = structuredClone(p.plan);
  Object.assign(changed.exercises[0].sets[0], { effort: 9 });
  expect(typedRepeatPlanSchema.safeParse(changed).success).toBe(false);
});
