import { z } from "zod";
import {
  detachExerciseLayout,
  groupExerciseLayout,
  removeExerciseLayout,
  reorderExerciseBlocks,
  reorderGroupMembers,
  setExerciseGroupRest,
  ungroupExerciseLayout,
  type ExerciseLayout,
} from "../../../src/domain/exercise-layout";
import {
  mobileCatalogEntrySchema,
  type MobileCatalogEntry,
} from "../../../src/lib/mobile/exercise-contracts";
import { createTypedDraft, typedContextSchema, typedDraftSchema } from "./typed-training";
import { TrainingChangeNeedsReview, type TrainingStructureChange } from "./training-structure";
import type { TypedActiveTraining } from "./training";

export function changeTypedTrainingStructure(
  a: TypedActiveTraining,
  op: TrainingStructureChange,
  now: Date,
  uuid: () => string,
): TypedActiveTraining {
  if (
    a.routine.origin.kind === "assigned" ||
    a.draft.status !== "in_progress" ||
    a.pause?.pausedAtMs != null
  )
    throw Error("Solo puedes organizar un entrenamiento personal o libre en curso.");
  const finish = (routine: typeof a.routine, draft: typeof a.draft): TypedActiveTraining => {
    const focused = a.draft.exercises[a.activeIndex]?.sessionExerciseId;
    const found = draft.exercises.findIndex((e) => e.sessionExerciseId === focused);
    return {
      ...a,
      routine: typedContextSchema.parse(routine),
      draft: typedDraftSchema.parse({ ...draft, updatedAt: now.toISOString() }),
      activeIndex:
        found < 0 ? Math.max(0, Math.min(a.activeIndex, draft.exercises.length - 1)) : found,
    };
  };
  const confirm = (id: string, stamp?: string) => {
    const i = a.draft.exercises.findIndex((e) => e.sessionExerciseId === id),
      exercise = a.draft.exercises[i],
      context = a.routine.exercises[i];
    if (!exercise || !context || context.sessionExerciseId !== id)
      throw Error("Ese ejercicio ya no está en el registro.");
    const review = {
      id,
      name: exercise.name,
      completedSets: exercise.sets.filter((s) => s.done).length,
      stamp: JSON.stringify({ exercise, context }),
    };
    if (stamp !== undefined && stamp !== review.stamp)
      throw Error("El ejercicio cambió desde la revisión. Vuelve a revisarlo.");
    if (review.completedSets && stamp === undefined) throw new TrainingChangeNeedsReview(review);
  };
  const choice = (
    entry: MobileCatalogEntry,
    id: string,
    old?: (typeof a.routine.exercises)[number],
  ) => ({
    sessionExerciseId: id,
    exerciseId: entry.id,
    name: entry.name,
    isBodyweight: entry.isBodyweight,
    prescribed: {
      recordType: null,
      sets: 3,
      target: {
        repsMin: 8,
        repsMax: 12,
        targetWeightKg: null,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      },
      series: null,
    },
    lastMetrics: null,
    note: null,
    restSeconds: 90,
    supersetId: old?.supersetId ?? null,
    supersetRestSeconds: old?.supersetId ? old.supersetRestSeconds : null,
    alternatives: [],
  });
  if (op.kind === "add") {
    const entries = z.array(mobileCatalogEntrySchema).min(1).parse(op.entries);
    if (a.draft.exercises.length + entries.length > 15)
      throw Error("Máximo 15 ejercicios por entrenamiento.");
    const additions = entries.map((entry) => choice(entry, uuid()));
    const routine = typedContextSchema.parse({
      ...a.routine,
      exercises: [...a.routine.exercises, ...additions],
    });
    const created = createTypedDraft({
      context: routine,
      userId: a.draft.userId,
      workoutId: a.draft.workoutId,
      now,
    });
    return finish(routine, {
      ...a.draft,
      exercises: [...a.draft.exercises, ...created.exercises.slice(a.draft.exercises.length)],
    });
  }
  if (op.kind === "replace") {
    const entry = mobileCatalogEntrySchema.parse(op.entry),
      i = a.draft.exercises.findIndex((e) => e.sessionExerciseId === op.id);
    if (i < 0) throw Error("Ese ejercicio ya no está en el registro.");
    if (a.draft.exercises[i].exerciseId === entry.id) return a;
    confirm(op.id, op.confirmedStamp);
    const replacement = choice(entry, op.id, a.routine.exercises[i]);
    const routine = typedContextSchema.parse({
      ...a.routine,
      exercises: a.routine.exercises.map((e, j) => (j === i ? replacement : e)),
    });
    const created = createTypedDraft({
      context: routine,
      userId: a.draft.userId,
      workoutId: a.draft.workoutId,
      now,
    }).exercises[i];
    const seed = uuid();
    created.sets = created.sets.map((s, j) => ({ ...s, id: `${seed}-${j + 1}` }));
    return finish(routine, {
      ...a.draft,
      exercises: a.draft.exercises.map((e, j) => (j === i ? created : e)),
    });
  }
  const before: ExerciseLayout = a.draft.exercises.map((e) => ({
    id: e.sessionExerciseId,
    name: e.name,
    supersetId: e.supersetId,
    supersetRestSeconds: e.supersetRestSeconds,
  }));
  let next: ExerciseLayout;
  switch (op.kind) {
    case "remove":
      confirm(op.id, op.confirmedStamp);
      next = removeExerciseLayout(before, op.id);
      break;
    case "reorder":
      next = reorderExerciseBlocks(before, op.fromId, op.toId);
      break;
    case "group":
      next = groupExerciseLayout(before, op.ids, uuid(), op.restSeconds);
      break;
    case "ungroup":
      next = ungroupExerciseLayout(before, op.groupId);
      break;
    case "detach":
      next = detachExerciseLayout(before, op.id);
      break;
    case "groupRest":
      next = setExerciseGroupRest(before, op.groupId, op.seconds);
      break;
    case "memberOrder":
      next = reorderGroupMembers(before, op.groupId, op.ids);
      break;
  }
  if (next === before) return a;
  const contexts = new Map(a.routine.exercises.map((e) => [e.sessionExerciseId, e])),
    drafts = new Map(a.draft.exercises.map((e) => [e.sessionExerciseId, e]));
  const fields = (r: ExerciseLayout[number]) => ({
    supersetId: r.supersetId ?? null,
    supersetRestSeconds: r.supersetId ? (r.supersetRestSeconds ?? null) : null,
  });
  return finish(
    { ...a.routine, exercises: next.map((r) => ({ ...contexts.get(r.id)!, ...fields(r) })) },
    { ...a.draft, exercises: next.map((r) => ({ ...drafts.get(r.id)!, ...fields(r) })) },
  );
}
