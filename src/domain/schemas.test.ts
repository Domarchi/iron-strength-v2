import { describe, expect, it } from "vitest";
import {
  commentSchema,
  exerciseInputSchema,
  LIMITS,
  measurementSchema,
  photoFileSchema,
  programInputSchema,
  sessionExerciseSchema,
  sessionLabelSchema,
  workoutSetSchema,
} from "./schemas";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(true);
const bad = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false);

const UUID = "11111111-1111-4111-8111-111111111111";

describe("límites declarados (DC-13, DC-15, DC-18)", () => {
  it("coinciden con la spec", () => {
    expect(LIMITS).toMatchObject({
      weeksMin: 1,
      weeksMax: 16,
      setsMax: 10,
      repsMax: 100,
      weightMaxKg: 500,
      exercisesPerSession: 15,
      sessionsPerWeek: 7,
      commentMax: 500,
      photosPerDay: 3,
      photoMaxBytes: 1_048_576,
    });
  });
});

describe("programInputSchema (RF-12)", () => {
  it("acepta 1 y 16 semanas, rechaza 0 y 17", () => {
    ok(programInputSchema, { name: "Fuerza", weeksCount: 1 });
    ok(programInputSchema, { name: "Fuerza", weeksCount: 16 });
    bad(programInputSchema, { name: "Fuerza", weeksCount: 0 });
    bad(programInputSchema, { name: "Fuerza", weeksCount: 17 });
    bad(programInputSchema, { name: "Fuerza", weeksCount: 2.5 });
  });

  it("exige nombre (1 a 100 caracteres, sin contar espacios sobrantes)", () => {
    ok(programInputSchema, { name: "a".repeat(100), weeksCount: 4 });
    bad(programInputSchema, { name: "a".repeat(101), weeksCount: 4 });
    bad(programInputSchema, { name: "   ", weeksCount: 4 });
  });

  it("convierte textos de formulario a número", () => {
    expect(programInputSchema.parse({ name: " X ", weeksCount: "4" })).toEqual({
      name: "X",
      weeksCount: 4,
    });
  });
});

describe("sessionLabelSchema (RF-13)", () => {
  it("acepta A a G y rechaza lo demás", () => {
    ["A", "D", "G"].forEach((l) => ok(sessionLabelSchema, l));
    ["H", "a", "AA", ""].forEach((l) => bad(sessionLabelSchema, l));
  });
});

describe("sessionExerciseSchema (RF-14)", () => {
  const base = { exerciseId: UUID, sets: 3, repsMin: 8, repsMax: 12 };

  it("acepta la prescripción mínima", () => ok(sessionExerciseSchema, base));

  it("series de 1 a 10", () => {
    ok(sessionExerciseSchema, { ...base, sets: 1 });
    ok(sessionExerciseSchema, { ...base, sets: 10 });
    bad(sessionExerciseSchema, { ...base, sets: 0 });
    bad(sessionExerciseSchema, { ...base, sets: 11 });
  });

  it("repeticiones de 1 a 100 y mínimo ≤ máximo", () => {
    ok(sessionExerciseSchema, { ...base, repsMin: 5, repsMax: 5 });
    ok(sessionExerciseSchema, { ...base, repsMin: 1, repsMax: 100 });
    bad(sessionExerciseSchema, { ...base, repsMin: 0 });
    bad(sessionExerciseSchema, { ...base, repsMax: 101 });
    bad(sessionExerciseSchema, { ...base, repsMin: 13, repsMax: 12 });
  });

  it("peso objetivo opcional de 0 a 500 kg", () => {
    ok(sessionExerciseSchema, { ...base, targetWeightKg: 0 });
    ok(sessionExerciseSchema, { ...base, targetWeightKg: 500 });
    ok(sessionExerciseSchema, { ...base, targetWeightKg: "" });
    expect(sessionExerciseSchema.parse({ ...base, targetWeightKg: "" }).targetWeightKg).toBeNull();
    bad(sessionExerciseSchema, { ...base, targetWeightKg: -1 });
    bad(sessionExerciseSchema, { ...base, targetWeightKg: 500.01 });
  });

  it("nota de hasta 500 caracteres", () => {
    ok(sessionExerciseSchema, { ...base, note: "n".repeat(500) });
    bad(sessionExerciseSchema, { ...base, note: "n".repeat(501) });
  });

  it("el id del ejercicio debe ser un uuid", () =>
    bad(sessionExerciseSchema, { ...base, exerciseId: "x" }));
});

describe("workoutSetSchema (RF-21, RF-23, DC-6)", () => {
  it("acepta peso 0 (peso corporal) con repeticiones ≥ 1", () => {
    ok(workoutSetSchema, { weightKg: 0, reps: 1, isWarmup: false });
    ok(workoutSetSchema, { weightKg: 500, reps: 100, isWarmup: true });
  });

  it("rechaza 0 repeticiones, más de 100, y pesos fuera de rango", () => {
    bad(workoutSetSchema, { weightKg: 50, reps: 0, isWarmup: false });
    bad(workoutSetSchema, { weightKg: 50, reps: 101, isWarmup: false });
    bad(workoutSetSchema, { weightKg: -0.5, reps: 5, isWarmup: false });
    bad(workoutSetSchema, { weightKg: 500.5, reps: 5, isWarmup: false });
  });

  it("acepta decimales de hasta 2 posiciones y rechaza más precisión", () => {
    ok(workoutSetSchema, { weightKg: 62.5, reps: 5, isWarmup: false });
    ok(workoutSetSchema, { weightKg: 62.25, reps: 5, isWarmup: false });
    bad(workoutSetSchema, { weightKg: 62.255, reps: 5, isWarmup: false });
  });
});

describe("measurementSchema (RF-38, DC-15)", () => {
  const date = "2026-10-01";

  it("exige al menos un campo", () => {
    bad(measurementSchema, { measuredOn: date });
    bad(measurementSchema, { measuredOn: date, weightKg: "", waistCm: "" });
    ok(measurementSchema, { measuredOn: date, weightKg: 80 });
  });

  it("peso 20 a 300 kg", () => {
    ok(measurementSchema, { measuredOn: date, weightKg: 20 });
    ok(measurementSchema, { measuredOn: date, weightKg: 300 });
    bad(measurementSchema, { measuredOn: date, weightKg: 19.9 });
    bad(measurementSchema, { measuredOn: date, weightKg: 300.1 });
  });

  it.each(["waistCm", "chestCm", "armCm"])("%s de 10 a 250 cm", (field) => {
    ok(measurementSchema, { measuredOn: date, [field]: 10 });
    ok(measurementSchema, { measuredOn: date, [field]: 250 });
    bad(measurementSchema, { measuredOn: date, [field]: 9.9 });
    bad(measurementSchema, { measuredOn: date, [field]: 250.1 });
  });

  it("la fecha debe ser válida y no estar en el futuro", () => {
    bad(measurementSchema, { measuredOn: "2026-13-40", weightKg: 80 });
    bad(measurementSchema, { measuredOn: "ayer", weightKg: 80 });
    expect(measurementSchema.safeParse({ measuredOn: "2999-01-01", weightKg: 80 }).success).toBe(
      false,
    );
  });

  it("convierte textos de formulario y deja los vacíos como null", () => {
    expect(measurementSchema.parse({ measuredOn: date, weightKg: "80,5", waistCm: "" })).toEqual({
      measuredOn: date,
      weightKg: 80.5,
      waistCm: null,
      chestCm: null,
      armCm: null,
    });
  });
});

describe("photoFileSchema (RF-43, DC-18)", () => {
  it("acepta JPEG y WebP de hasta 1 MB", () => {
    ok(photoFileSchema, { type: "image/jpeg", size: 1_048_576 });
    ok(photoFileSchema, { type: "image/webp", size: 1 });
  });

  it("rechaza otros tipos, archivos vacíos y los que superan 1 MB", () => {
    bad(photoFileSchema, { type: "image/png", size: 1000 });
    bad(photoFileSchema, { type: "application/pdf", size: 1000 });
    bad(photoFileSchema, { type: "image/jpeg", size: 0 });
    bad(photoFileSchema, { type: "image/jpeg", size: 1_048_577 });
  });
});

describe("commentSchema (RF-36, DC-14)", () => {
  it("1 a 500 caracteres", () => {
    ok(commentSchema, { body: "a" });
    ok(commentSchema, { body: "a".repeat(500) });
    bad(commentSchema, { body: "a".repeat(501) });
    bad(commentSchema, { body: "   " });
  });
});

describe("exerciseInputSchema (RF-10)", () => {
  const base = { name: "Press", muscleGroup: "Pecho" };

  it("acepta los 7 grupos musculares y rechaza otros", () => {
    ["Pecho", "Espalda", "Hombros", "Brazos", "Piernas", "Core", "Cardio"].forEach((g) =>
      ok(exerciseInputSchema, { ...base, muscleGroup: g }),
    );
    bad(exerciseInputSchema, { ...base, muscleGroup: "Cuello" });
  });

  it("incremento de progresión entre 0 (exclusivo) y 20 kg", () => {
    ok(exerciseInputSchema, { ...base, progressionIncrementKg: 0.5 });
    ok(exerciseInputSchema, { ...base, progressionIncrementKg: 20 });
    bad(exerciseInputSchema, { ...base, progressionIncrementKg: 0 });
    bad(exerciseInputSchema, { ...base, progressionIncrementKg: 20.5 });
  });

  it("nombre de 1 a 100 caracteres", () => {
    bad(exerciseInputSchema, { ...base, name: "" });
    bad(exerciseInputSchema, { ...base, name: "x".repeat(101) });
  });
});
