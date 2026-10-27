import { describe, expect, it } from "vitest";
import {
  changeTrainingStructure,
  reviewTrainingExercise,
  TrainingChangeNeedsReview,
} from "./training-structure";
import { createPersonalTrainingDraft, personalRoutineContext } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import { DEMO_ROUTINES } from "./demo";
import { createDraft } from "../../../src/lib/workout/runner-state";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-26T12:00:00Z");
const entry = {
  id: id(600),
  name: "Sentadilla",
  muscleGroup: "Piernas" as const,
  equipment: "Barra",
  isBodyweight: false,
  progressionIncrementKg: 2.5,
};
function setup() {
  const base = personalRoutineFixture(),
    routine = personalRoutineContext(base);
  const draft = createPersonalTrainingDraft({
    context: routine,
    userId: id(1),
    workoutId: id(2),
    now,
  });
  draft.rest = { endsAt: now.getTime() + 60000, totalSeconds: 60 };
  let n = 900;
  const uuid = () => id(n++);
  const active = { mode: "real" as const, routine, draft, activeIndex: 1 };
  return { base, active, uuid };
}
describe("propuestas completas de organización del registro", () => {
  it("agrega a rutina personal sin cambiar la base, valores existentes, origen o descanso", () => {
    const x = setup(),
      before = JSON.stringify(x.base);
    const next = changeTrainingStructure(x.active, { kind: "add", entries: [entry] }, now, x.uuid);
    expect(next.draft.exercises).toHaveLength(3);
    expect(next.routine.exercises).toHaveLength(3);
    expect(next.draft.exercises.slice(0, 2)).toEqual(x.active.draft.exercises);
    expect(next.routine.exercises[2]).toMatchObject({
      exerciseId: entry.id,
      prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: null },
    });
    expect(next.draft.origin).toEqual(x.active.draft.origin);
    expect(next.draft.rest).toEqual(x.active.draft.rest);
    expect(JSON.stringify(x.base)).toBe(before);
  });
  it("reordena ambos arrays por bloque y conserva el ejercicio activo por identidad", () => {
    const x = setup(),
      added = changeTrainingStructure(x.active, { kind: "add", entries: [entry] }, now, x.uuid);
    const groupMember = x.active.draft.exercises[0].sessionExerciseId,
      target = added.draft.exercises[2].sessionExerciseId;
    const next = changeTrainingStructure(
      added,
      { kind: "reorder", fromId: groupMember, toId: target },
      now,
      x.uuid,
    );
    expect(next.draft.exercises.map((e) => e.sessionExerciseId)).toEqual([
      target,
      ...x.active.draft.exercises.map((e) => e.sessionExerciseId),
    ]);
    expect(next.routine.exercises.map((e) => e.sessionExerciseId)).toEqual(
      next.draft.exercises.map((e) => e.sessionExerciseId),
    );
    expect(next.activeIndex).toBe(2);
    expect(next.draft.rest).toEqual(added.draft.rest);
    expect(
      changeTrainingStructure(next, { kind: "reorder", fromId: target, toId: null }, now, x.uuid),
    ).toBe(next);
  });
  it("reemplazar series hechas requiere revisión y no traslada sus valores al elegido", () => {
    const x = setup(),
      target = x.active.draft.exercises[0];
    target.sets[0] = { ...target.sets[0], done: true, reps: "10" };
    const review = reviewTrainingExercise(x.active, target.sessionExerciseId);
    expect(review.completedSets).toBe(1);
    expect(() =>
      changeTrainingStructure(
        x.active,
        { kind: "replace", id: target.sessionExerciseId, entry },
        now,
        x.uuid,
      ),
    ).toThrow(TrainingChangeNeedsReview);
    const next = changeTrainingStructure(
      x.active,
      { kind: "replace", id: target.sessionExerciseId, entry, confirmedStamp: review.stamp },
      now,
      x.uuid,
    );
    expect(next.draft.exercises[0]).toMatchObject({
      sessionExerciseId: target.sessionExerciseId,
      exerciseId: entry.id,
      supersetId: target.supersetId,
      supersetRestSeconds: 60,
    });
    expect(next.draft.exercises[0].sets).toHaveLength(3);
    expect(
      next.draft.exercises[0].sets.every((s) => !s.done && s.weight === "" && s.reps === ""),
    ).toBe(true);
    expect(
      next.draft.exercises[0].sets.some((s) => target.sets.some((old) => old.id === s.id)),
    ).toBe(false);
    expect(next.draft.exercises[1]).toEqual(x.active.draft.exercises[1]);
    expect(target.sets[0].done).toBe(true);
  });
  it("una confirmación desactualizada se rechaza sin retirar datos nuevos", () => {
    const x = setup(),
      target = x.active.draft.exercises[0];
    target.sets[0].done = true;
    const review = reviewTrainingExercise(x.active, target.sessionExerciseId);
    target.sets[1].reps = "12";
    expect(() =>
      changeTrainingStructure(
        x.active,
        { kind: "remove", id: target.sessionExerciseId, confirmedStamp: review.stamp },
        now,
        x.uuid,
      ),
    ).toThrow("cambió");
    expect(x.active.draft.exercises[0].sets[1].reps).toBe("12");
    expect(x.active.draft.exercises).toHaveLength(2);
  });
  it("quitar el activo exige confirmar sus series y limpia el grupo que queda solo", () => {
    const x = setup(),
      target = x.active.draft.exercises[1];
    target.sets[0].done = true;
    expect(() =>
      changeTrainingStructure(
        x.active,
        { kind: "remove", id: target.sessionExerciseId },
        now,
        x.uuid,
      ),
    ).toThrow(TrainingChangeNeedsReview);
    const review = reviewTrainingExercise(x.active, target.sessionExerciseId);
    const next = changeTrainingStructure(
      x.active,
      { kind: "remove", id: target.sessionExerciseId, confirmedStamp: review.stamp },
      now,
      x.uuid,
    );
    expect(next.activeIndex).toBe(0);
    expect(next.draft.exercises[0].supersetId).toBeUndefined();
    expect(next.routine.exercises[0].supersetId).toBeNull();
    expect(next.draft.rest).toEqual(x.active.draft.rest);
  });
  it("separar, reagrupar, ordenar integrantes y cambiar descanso no reescribe series", () => {
    const x = setup(),
      gid = x.active.draft.exercises[0].supersetId!;
    const separated = changeTrainingStructure(
      x.active,
      { kind: "ungroup", groupId: gid },
      now,
      x.uuid,
    );
    const grouped = changeTrainingStructure(
      separated,
      {
        kind: "group",
        ids: separated.draft.exercises.map((e) => e.sessionExerciseId),
        restSeconds: 0,
      },
      now,
      x.uuid,
    );
    const groupId = grouped.draft.exercises[0].supersetId!;
    const ids = grouped.draft.exercises.map((e) => e.sessionExerciseId).reverse();
    const reordered = changeTrainingStructure(
      grouped,
      { kind: "memberOrder", groupId, ids },
      now,
      x.uuid,
    );
    const next = changeTrainingStructure(
      reordered,
      { kind: "groupRest", groupId, seconds: 45 },
      now,
      x.uuid,
    );
    expect(next.draft.exercises.map((e) => e.sessionExerciseId)).toEqual(ids);
    expect(next.routine.exercises.every((e) => e.supersetRestSeconds === 45)).toBe(true);
    expect(next.draft.exercises.every((e) => e.supersetRestSeconds === 45)).toBe(true);
    expect(next.draft.exercises[0].sets).toEqual(x.active.draft.exercises[1].sets);
    expect(next.draft.rest).toEqual(x.active.draft.rest);
    const detached = changeTrainingStructure(next, { kind: "detach", id: ids[0] }, now, x.uuid);
    expect(detached.draft.exercises.every((e) => !e.supersetId)).toBe(true);
  });
  it("retirar todos permite reconstruir la sesión sin cambiar el origen personal", () => {
    const x = setup();
    let a = x.active;
    for (const row of x.active.draft.exercises)
      a = changeTrainingStructure(a, { kind: "remove", id: row.sessionExerciseId }, now, x.uuid);
    expect(a.activeIndex).toBe(0);
    expect(a.draft.exercises).toHaveLength(0);
    const next = changeTrainingStructure(a, { kind: "add", entries: [entry] }, now, x.uuid);
    expect(next.draft.origin).toEqual(x.active.draft.origin);
    expect(next.activeIndex).toBe(0);
  });
  it("valida lote y límite antes de publicar cualquier agregado", () => {
    const x = setup();
    expect(() =>
      changeTrainingStructure(
        x.active,
        { kind: "add", entries: Array.from({ length: 14 }, () => entry) },
        now,
        x.uuid,
      ),
    ).toThrow("15");
    expect(() =>
      changeTrainingStructure(
        x.active,
        { kind: "add", entries: [entry, { ...entry, id: "invalid" }] },
        now,
        x.uuid,
      ),
    ).toThrow();
    expect(x.active.draft.exercises).toHaveLength(2);
  });
  it("no adapta asignadas, pausadas ni cierres congelados", () => {
    const x = setup(),
      routine = DEMO_ROUTINES[0];
    const assigned = {
      mode: "real" as const,
      routine,
      draft: createDraft({
        workoutId: id(2),
        userId: id(1),
        plannedSession: routine.session,
        exercises: routine.exercises.map((e) => ({
          ...e,
          lastWeightKg: e.lastWeightKg ?? null,
          alternatives: e.alternatives?.map((a) => ({
            ...a,
            lastWeightKg: a.lastWeightKg ?? null,
          })),
        })),
        now,
      }),
      activeIndex: 0,
    };
    expect(() =>
      changeTrainingStructure(assigned, { kind: "add", entries: [entry] }, now, x.uuid),
    ).toThrow("personal");
    expect(() =>
      changeTrainingStructure(
        { ...x.active, pause: { version: 1, pausedAtMs: now.getTime(), pausedMilliseconds: 0 } },
        { kind: "add", entries: [entry] },
        now,
        x.uuid,
      ),
    ).toThrow("pausa");
    expect(() =>
      changeTrainingStructure(
        { ...x.active, draft: { ...x.active.draft, status: "pending_save" } },
        { kind: "add", entries: [entry] },
        now,
        x.uuid,
      ),
    ).toThrow("curso");
  });
});
