import { describe, it, expect } from "vitest";
import { prepareWorkoutRepeat } from "./workout-repeat";
import { repeatWorkoutFixture as fixture } from "../test/fixtures/repeat-workout";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("repetir un resultado propio sin reinterpretar su base", () => {
  it("prepara estructura/objetivos y valores reales sin mutar el resultado o catálogo", () => {
    const { workout, catalog } = fixture(),
      before = structuredClone({ workout, catalog });
    const result = prepareWorkoutRepeat(workout, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan).toMatchObject({
      sourceWorkoutId: workout.id,
      title: "Superior",
      kind: "recorded",
      warnings: [],
    });
    expect(result.plan.exercises).toHaveLength(2);
    expect(result.plan.exercises[0]).toMatchObject({
      sourcePosition: 0,
      sourceRowId: workout.structure!.exercises[0].id,
      prescribed: workout.structure!.exercises[0].prescribed,
      restSeconds: 90,
      supersetId: workout.structure!.exercises[0].supersetId,
      supersetRestSeconds: 60,
      note: "Controlado",
      sets: [{ weightKg: 30, reps: 8, isWarmup: false }],
    });
    expect({ workout, catalog }).toEqual(before);
  });
  it("repite el realizado en una alternativa, sin depender del prescrito o de un programa", () => {
    const { workout, catalog } = fixture();
    workout.exercises[0].prescribedExerciseId = id(9999);
    workout.programName = "Programa que desapareció";
    workout.sourceKind = "assigned";
    const result = prepareWorkoutRepeat(workout, catalog);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan.exercises[0].exerciseId).toBe(workout.exercises[0].exerciseId);
    expect(result.plan).not.toHaveProperty("programId");
  });
  it("filtra filas no realizadas y separa una superserie incompleta preservando descanso de ronda", () => {
    const { workout, catalog } = fixture();
    workout.exercises.pop();
    const result = prepareWorkoutRepeat(workout, catalog);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan.exercises).toHaveLength(1);
    expect(result.plan.exercises[0]).toMatchObject({
      supersetId: null,
      supersetRestSeconds: null,
      restSeconds: 60,
    });
    expect(result.plan.warnings).toEqual(
      expect.arrayContaining(["unperformed", "incomplete_group"]),
    );
  });
  it("al conservar dos integrantes de un grupo de tres mantiene orden y grupo", () => {
    const { workout, catalog } = fixture();
    const extra = structuredClone(workout.structure!.exercises[1]);
    extra.id = id(3001);
    extra.exerciseId = id(3002);
    workout.structure!.exercises.push(extra);
    workout.exercises[1] = { ...workout.exercises[1], position: 2, exerciseId: extra.exerciseId };
    catalog.push({ ...catalog[1], id: extra.exerciseId });
    const result = prepareWorkoutRepeat(workout, catalog);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan.exercises.map((e) => e.sourcePosition)).toEqual([0, 2]);
    expect(result.plan.exercises[0].supersetId).toBe(result.plan.exercises[1].supersetId);
  });
  it("al disolver un grupo sin descanso prescrito conserva el habitual, aunque el individual sea cero", () => {
    const { workout, catalog } = fixture();
    workout.exercises.pop();
    workout.structure!.exercises.forEach((e) => {
      e.supersetRestSeconds = null;
      e.restSeconds = 0;
    });
    const prepared = prepareWorkoutRepeat(workout, catalog),
      custom = prepareWorkoutRepeat(workout, catalog, 120);
    if (!prepared.ok || !custom.ok) throw Error("Debía preparar completo");
    expect(prepared.plan.exercises[0].restSeconds).toBe(90);
    expect(custom.plan.exercises[0].restSeconds).toBe(120);
  });
  it("sin snapshot deriva objetivos de valores reales, sin notas/grupos del programa actual", () => {
    const { workout, catalog } = fixture();
    delete workout.structure;
    workout.exercises[0].sets.push({
      id: id(1003),
      setNumber: 3,
      weightKg: 27.5,
      reps: 10,
      isWarmup: false,
    });
    workout.exercises[0].sets.unshift({
      id: id(1002),
      setNumber: 0,
      weightKg: 20,
      reps: 6,
      isWarmup: true,
    });
    // Números reales positivos y con huecos, en orden distinto al que llegarán.
    workout.exercises[0].sets[0].setNumber = 2;
    const result = prepareWorkoutRepeat(workout, catalog);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan.kind).toBe("derived");
    expect(result.plan.warnings).toContain("legacy");
    expect(result.plan.exercises[0]).toMatchObject({
      note: null,
      supersetId: null,
      restSeconds: 90,
      prescribed: { sets: 2, repsMin: 8, repsMax: 10, targetWeightKg: null },
    });
    expect(result.plan.exercises[0].sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(result.plan.exercises[0].sets[1].isWarmup).toBe(true);
  });
  it("un registro solo con calentamientos no inventa series de trabajo", () => {
    const { workout, catalog } = fixture();
    delete workout.structure;
    workout.exercises = workout.exercises.slice(0, 1);
    workout.exercises[0].sets[0].isWarmup = true;
    const result = prepareWorkoutRepeat(workout, catalog);
    if (!result.ok) throw Error("Debía preparar");
    expect(result.plan.warnings).toContain("warmups_only");
    expect(result.plan.exercises[0].sets).toHaveLength(1);
    expect(result.plan.exercises[0].sets[0].isWarmup).toBe(true);
  });
  it.each([0, 120])(
    "el descanso habitual configurable no se atribuye al histórico sin estructura: %s",
    (rest) => {
      const { workout, catalog } = fixture();
      delete workout.structure;
      const result = prepareWorkoutRepeat(workout, catalog, rest);
      if (!result.ok) throw Error("Debía preparar");
      expect(result.plan.exercises[0].restSeconds).toBe(rest);
      expect(result.plan.kind).toBe("derived");
    },
  );
  it("20 series reales caben con objetivos registrados;21 o11 objetivos derivados se explican sin recortar", () => {
    const { workout, catalog } = fixture();
    workout.exercises[0].sets = Array.from({ length: 20 }, (_, i) => ({
      id: id(4000 + i),
      setNumber: i + 1,
      weightKg: 30,
      reps: 8,
      isWarmup: false,
    }));
    const result = prepareWorkoutRepeat(workout, catalog);
    expect(result.ok && result.plan.exercises[0].sets.length).toBe(20);
    workout.exercises[0].sets.push({
      ...workout.exercises[0].sets[0],
      id: id(5000),
      setNumber: 21,
    });
    expect(prepareWorkoutRepeat(workout, catalog)).toMatchObject({ ok: false, reason: "limit" });
    delete workout.structure;
    workout.exercises[0].sets = workout.exercises[0].sets.slice(0, 11);
    expect(prepareWorkoutRepeat(workout, catalog)).toMatchObject({ ok: false, reason: "limit" });
  });
  it("un ejercicio no disponible no produce una preparación parcial", () => {
    const { workout, catalog } = fixture();
    const before = structuredClone(workout);
    expect(prepareWorkoutRepeat(workout, catalog.slice(1))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(workout).toEqual(before);
  });
  it("rechaza valores, posiciones, duplicados e identidad incoherentes sin reemplazar el resultado", () => {
    const input = fixture();
    for (const change of [
      (w: typeof input.workout) => {
        w.exercises[0].sets[0].weightKg = -1;
      },
      (w: typeof input.workout) => {
        w.exercises[0].sets[0].reps = 0;
      },
      (w: typeof input.workout) => {
        w.exercises[0].sets.push({ ...w.exercises[0].sets[0], id: id(6000) });
      },
      (w: typeof input.workout) => {
        w.exercises[1].position = 0;
      },
      (w: typeof input.workout) => {
        w.exercises[1].exerciseId = input.catalog[0].id;
      },
    ]) {
      const w = structuredClone(input.workout);
      change(w);
      expect(prepareWorkoutRepeat(w, input.catalog)).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    }
  });
  it("sin series, más de15 posiciones y una versión futura no se convierten silenciosamente", () => {
    const { workout, catalog } = fixture();
    workout.exercises = [];
    expect(prepareWorkoutRepeat(workout, catalog)).toMatchObject({ ok: false, reason: "no_sets" });
    delete workout.structure;
    workout.exercises = Array.from({ length: 16 }, (_, i) => ({
      position: i,
      exerciseId: catalog[0].id,
      name: catalog[0].name,
      sets: [{ id: id(8000 + i), setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
    }));
    expect(prepareWorkoutRepeat(workout, catalog)).toMatchObject({ ok: false, reason: "limit" });
    const unknown = fixture().workout;
    Object.assign(unknown.structure!, { version: 99 });
    expect(prepareWorkoutRepeat(unknown, catalog)).toMatchObject({ ok: false, reason: "invalid" });
  });
});
