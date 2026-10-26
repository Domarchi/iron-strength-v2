import { describe, expect, it } from "vitest";
import {
  personalRoutineContext,
  freeRoutineContext,
  createPersonalTrainingDraft,
  buildPersonalTrainingPayload,
  nativeWorkoutPayloadSchema,
} from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
const id = (n: number) => `af213000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-26T12:00:00Z");
describe("contenido nativo personal y libre", () => {
  it("copia origen y objetivos sin fabricar programa; registro independiente", () => {
    const routine = personalRoutineFixture(),
      context = personalRoutineContext(routine);
    const draft = createPersonalTrainingDraft({ context, userId: id(1), workoutId: id(2), now });
    expect(draft).toMatchObject({
      version: 3,
      programId: null,
      plannedSessionId: null,
      origin: { kind: "personal", routineId: routine.id, revision: 4 },
    });
    expect(draft.exercises[0].sets[0].weight).toBe("30");
    expect(draft.exercises[0].supersetId).toBe(draft.exercises[1].supersetId);
    draft.exercises[0].prescribed.targetWeightKg = 40;
    expect(routine.items[0].targetWeightKg).toBe(30);
    expect(context.exercises[0].prescribed.targetWeightKg).toBe(30);
    expect(buildPersonalTrainingPayload(draft, now)).toMatchObject({
      ok: false,
      reason: "no_sets",
    });
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      weight: "30",
      reps: "10",
      done: true,
    };
    const built = buildPersonalTrainingPayload(draft, new Date(now.getTime() + 60000));
    expect(built).toMatchObject({
      ok: true,
      payload: {
        id: id(2),
        title: "Superior",
        origin: { kind: "personal", routineId: routine.id, revision: 4 },
        sets: [{ exerciseId: id(300), position: 0, setNumber: 1, weightKg: 30, reps: 10 }],
      },
    });
    if (built.ok) {
      expect(built.payload).not.toHaveProperty("programId");
      expect(built.payload.sets[0]).not.toHaveProperty("sessionExerciseId");
    }
  });
  it("libre empieza vacío con identificadores de programa nulos y no se cierra vacío", () => {
    const context = freeRoutineContext("Mi sesión"),
      draft = createPersonalTrainingDraft({ context, userId: id(1), workoutId: id(2), now });
    expect(draft.origin).toEqual({ kind: "free" });
    expect(draft.programId).toBeNull();
    expect(draft.plannedSessionId).toBeNull();
    expect(draft.exercises).toHaveLength(0);
    expect(buildPersonalTrainingPayload(draft, now).ok).toBe(false);
    expect(freeRoutineContext().session.title).toBe("Entrenamiento libre");
    expect(() => personalRoutineContext({ ...personalRoutineFixture(), items: [] })).toThrow();
  });
  it("una serie completada inválida impide cerrar parcialmente", () => {
    const draft = createPersonalTrainingDraft({
      context: personalRoutineContext(personalRoutineFixture()),
      userId: id(1),
      workoutId: id(2),
      now,
    });
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      weight: "30",
      reps: "10",
      done: true,
    };
    draft.exercises[1].sets[0] = {
      ...draft.exercises[1].sets[0],
      weight: "30",
      reps: "inválido",
      done: true,
    };
    expect(buildPersonalTrainingPayload(draft, now)).toEqual({ ok: false, reason: "invalid" });
  });
  it("no convierte payload futuro en asignado legado ni reinterpreta el existente", () => {
    const legacy = {
      id: id(1),
      programId: id(2),
      programSessionId: id(3),
      sessionLabel: "A",
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationSeconds: 0,
      sets: [],
    };
    expect(nativeWorkoutPayloadSchema.parse(legacy)).toEqual(legacy);
    expect(nativeWorkoutPayloadSchema.safeParse({ ...legacy, version: 99 }).success).toBe(false);
    expect(
      nativeWorkoutPayloadSchema.safeParse({ ...legacy, origin: { kind: "free" } }).success,
    ).toBe(false);
  });
});
