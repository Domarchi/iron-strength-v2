import { expect, it } from "vitest";
import { typedResultFixture } from "../test/fixtures/typed-result";
import { prepareTypedWorkoutRoutine } from "./typed-workout-routine";
import { typedPersonalItemsInput } from "./typed-personal-routines";
it("prepara toda la estructura3 sin esfuerzos/notas propias ni mutar el resultado", () => {
  const { result, catalog } = typedResultFixture();
  result.workout.exercises[5].sets = [];
  const before = JSON.stringify(result),
    prepared = prepareTypedWorkoutRoutine(result.workout, catalog.exercises);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw Error(prepared.message);
  expect(prepared.items).toHaveLength(9);
  expect(typedPersonalItemsInput(prepared.items).map((r) => r.prescribed)).toEqual(
    result.workout.structure.exercises.map((r) => r.prescribed),
  );
  expect(prepared.items[5].note).toBe("Indicación 5");
  expect(JSON.stringify(prepared)).not.toContain("Nota propia");
  expect(JSON.stringify(prepared)).not.toContain("Nota global");
  expect(JSON.stringify(prepared)).not.toContain("effort");
  expect(JSON.stringify(result)).toBe(before);
});
it("bloquea catálogo incompleto o tipo distinto sin preparar una copia parcial", () => {
  const { result, catalog } = typedResultFixture();
  expect(prepareTypedWorkoutRoutine(result.workout, catalog.exercises.slice(1))).toMatchObject({
    ok: false,
    reason: "unavailable",
  });
  const changed = structuredClone(catalog.exercises);
  changed[5].recordType = "weight_reps";
  expect(prepareTypedWorkoutRoutine(result.workout, changed)).toMatchObject({
    ok: false,
    reason: "unavailable",
  });
});
it("rechaza documentos inconsistentes, conserva títulos anteriores e indicaciones vacías", () => {
  const { result, catalog } = typedResultFixture();
  const broken = structuredClone(result.workout);
  broken.structure.exercises[5].prescribed.target.repsMin = 8;
  expect(prepareTypedWorkoutRoutine(broken, catalog.exercises)).toMatchObject({
    ok: false,
    reason: "invalid",
  });
  result.workout.title = null;
  result.workout.programName = "Programa";
  result.workout.structure.exercises[0].note = null;
  result.workout.exercises[0].note = null;
  let prepared = prepareTypedWorkoutRoutine(result.workout, catalog.exercises);
  if (!prepared.ok) throw Error(prepared.message);
  expect(prepared.title).toBe("Programa");
  expect(prepared.items[0].note).toBe("");
  result.workout.programName = null;
  prepared = prepareTypedWorkoutRoutine(result.workout, catalog.exercises);
  expect(prepared).toMatchObject({ ok: true, title: "Entrenamiento libre" });
});
