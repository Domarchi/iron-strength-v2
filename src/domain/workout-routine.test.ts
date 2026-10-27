import { describe, expect, it } from "vitest";
import { prepareWorkoutRoutine } from "./workout-routine";
import { repeatWorkoutFixture as fixture } from "../test/fixtures/repeat-workout";
import { personalItemsInput } from "./personal-routines";

describe("guardar una base desde el resultado", () => {
  it("conserva toda la estructura, incluso ejercicios no realizados y sus grupos", () => {
    const { workout, catalog } = fixture();
    workout.exercises.pop();
    const before = structuredClone({ workout, catalog });
    const result = prepareWorkoutRoutine(workout, catalog);
    if (!result.ok) throw Error(result.message);
    expect(result.kind).toBe("recorded");
    expect(result.items).toHaveLength(2);
    expect(personalItemsInput(result.items)[0]).toMatchObject({
      ...workout.structure!.exercises[0].prescribed,
      restSeconds: 90,
      supersetRestSeconds: 60,
      note: "Controlado",
    });
    expect(result.items[0].supersetId).toBe(result.items[1].supersetId);
    expect({ workout, catalog }).toEqual(before);
  });
  it("conserva detalle y el realizado, sin volver al ejercicio prescrito", () => {
    const { workout, catalog } = fixture();
    workout.structure!.exercises[0].prescribedExerciseId = workout.id;
    const result = prepareWorkoutRoutine(workout, catalog);
    if (!result.ok) throw Error(result.message);
    expect(result.items[0].exerciseId).toBe(catalog[0].id);
    expect(result.items[0]).not.toHaveProperty("prescribedExerciseId");
  });
  it("sin estructura deriva trabajo y explica procedencia; no incluye calentamientos como objetivos", () => {
    const { workout, catalog } = fixture();
    delete workout.structure;
    workout.exercises[0].sets.push({
      ...workout.exercises[0].sets[0],
      id: workout.id,
      setNumber: 2,
      isWarmup: true,
    });
    const result = prepareWorkoutRoutine(workout, catalog);
    if (!result.ok) throw Error(result.message);
    expect(result.kind).toBe("derived");
    expect(result.items[0]).toMatchObject({
      sets: "1",
      repsMin: "8",
      targetWeightKg: "30",
      restSeconds: "90",
      note: "",
      supersetId: null,
    });
  });
  it("no inventa una prescripción si solo hay calentamientos sin estructura", () => {
    const { workout, catalog } = fixture();
    delete workout.structure;
    workout.exercises[0].sets[0].isWarmup = true;
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({
      ok: false,
      reason: "warmups_only",
    });
  });
  it("bloquea datos inválidos, identidades duplicadas y catálogo incompleto sin omitir filas", () => {
    const { workout, catalog } = fixture();
    expect(prepareWorkoutRoutine(workout, catalog.slice(1))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    workout.structure!.exercises[1].id = workout.structure!.exercises[0].id;
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({ ok: false, reason: "invalid" });
    expect(prepareWorkoutRoutine({ ...workout, durationSeconds: -1 }, catalog).ok).toBe(false);
  });
  it("rechaza una serie que apunta a otra fila del snapshot, sin reasignarla", () => {
    const { workout, catalog } = fixture();
    workout.exercises[0].exerciseId = catalog[1].id;
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("propaga límites del legado y no crea una base sin series reales", () => {
    const { workout, catalog } = fixture();
    delete workout.structure;
    workout.exercises = [];
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({ ok: false, reason: "no_sets" });
  });
  it("preserva objetivos diferentes, notas vacías y descansos habituales sin reinterpretarlos", () => {
    const { workout, catalog } = fixture();
    workout.title = null;
    workout.programName = null;
    workout.sessionLabel = "B";
    const row = workout.structure!.exercises[0];
    row.note = null;
    row.restSeconds = null;
    row.prescribed = {
      sets: 2,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: null,
      series: [
        { repsMin: 8, repsMax: 10, targetWeightKg: 30 },
        { repsMin: 10, repsMax: 12, targetWeightKg: 25 },
      ],
    };
    const result = prepareWorkoutRoutine(workout, catalog);
    if (!result.ok) throw Error(result.message);
    expect(result.title).toBe("Entrenamiento B");
    expect(personalItemsInput(result.items)[0]).toMatchObject({
      ...row.prescribed,
      note: "",
      restSeconds: null,
    });
    workout.sessionLabel = null;
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({
      ok: true,
      title: "Entrenamiento libre",
    });
    workout.programName = "Programa anterior";
    expect(prepareWorkoutRoutine(workout, catalog)).toMatchObject({
      ok: true,
      title: "Programa anterior",
    });
  });
});
