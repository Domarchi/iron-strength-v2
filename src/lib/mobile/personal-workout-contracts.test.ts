import { describe, expect, it } from "vitest";
import {
  personalWorkoutPayloadSchema,
  personalWorkoutRequestSchema,
} from "./personal-workout-contracts";
const id = (n: number) => `af213000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = () => ({
  version: 1,
  id: id(1),
  origin: { kind: "free" },
  title: "Libre",
  startedAt: "2026-10-26T12:00:00Z",
  finishedAt: "2026-10-26T12:30:00Z",
  durationSeconds: 1800,
  sets: [{ exerciseId: id(2), position: 0, setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
});
describe("contrato de entrenamiento sin asignación", () => {
  it("libre no necesita programa y personal tiene procedencia explícita", () => {
    expect(personalWorkoutPayloadSchema.parse(payload())).toMatchObject({
      origin: { kind: "free" },
    });
    expect(
      personalWorkoutPayloadSchema.parse({
        ...payload(),
        origin: { kind: "personal", routineId: id(3), revision: 2 },
      }).origin.kind,
    ).toBe("personal");
    expect(personalWorkoutRequestSchema.parse({ version: 1, payload: payload() }).payload.id).toBe(
      id(1),
    );
    for (const extra of [{ studentId: id(9) }, { programId: id(9) }, { programSessionId: id(9) }])
      expect(personalWorkoutPayloadSchema.safeParse({ ...payload(), ...extra }).success).toBe(
        false,
      );
    expect(
      personalWorkoutPayloadSchema.safeParse({
        ...payload(),
        origin: { kind: "personal", routineId: id(3) },
      }).success,
    ).toBe(false);
  });
  it("valida límites reales y no inventa series o posiciones", () => {
    for (const patch of [
      { sets: [] },
      { title: " " },
      { perceivedEffort: 11 },
      { note: "x".repeat(501) },
      { durationSeconds: 86401 },
      { finishedAt: "2026-10-26T11:00:00Z" },
    ])
      expect(personalWorkoutPayloadSchema.safeParse({ ...payload(), ...patch }).success).toBe(
        false,
      );
    for (const patch of [
      { position: 15 },
      { setNumber: 21 },
      { weightKg: 0.001 },
      { weightKg: 501 },
      { reps: 101 },
      { reps: 0 },
      { exerciseName: "Inventado" },
      { prescribedExerciseId: id(9) },
    ])
      expect(
        personalWorkoutPayloadSchema.safeParse({
          ...payload(),
          sets: [{ ...payload().sets[0], ...patch }],
        }).success,
      ).toBe(false);
    expect(
      personalWorkoutPayloadSchema.safeParse({
        ...payload(),
        sets: [payload().sets[0], payload().sets[0]],
      }).success,
    ).toBe(false);
    expect(
      personalWorkoutPayloadSchema.safeParse({
        ...payload(),
        sets: [payload().sets[0], { ...payload().sets[0], setNumber: 2, exerciseId: id(9) }],
      }).success,
    ).toBe(false);
    expect(
      personalWorkoutPayloadSchema.safeParse({
        ...payload(),
        sets: [{ ...payload().sets[0], position: 14, setNumber: 20 }],
      }).success,
    ).toBe(true);
  });
});
