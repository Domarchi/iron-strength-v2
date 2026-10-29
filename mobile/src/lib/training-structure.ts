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
import { validSupersetLayout } from "../../../src/domain/supersets";
import {
  mobileCatalogEntrySchema,
  type MobileCatalogEntry,
} from "../../../src/lib/mobile/exercise-contracts";
import { prefillDraftExercises } from "../../../src/lib/workout/runner-state";
import {
  personalContextSchema,
  personalTrainingDraftSchema,
  type PersonalTrainingContext,
  type PersonalTrainingDraft,
} from "./personal-training";
import type { ActiveTraining } from "./training";

export type PersonalActiveTraining = Omit<ActiveTraining, "routine" | "draft" | "mode"> & {
  mode: "real";
  routine: PersonalTrainingContext;
  draft: PersonalTrainingDraft;
};
export type TrainingStructureChange =
  | { kind: "add"; entries: MobileCatalogEntry[] }
  | { kind: "replace"; id: string; entry: MobileCatalogEntry; confirmedStamp?: string }
  | { kind: "remove"; id: string; confirmedStamp?: string }
  | { kind: "reorder"; fromId: string; toId: string | null }
  | { kind: "group"; ids: string[]; restSeconds: number | null }
  | { kind: "ungroup"; groupId: string }
  | { kind: "detach"; id: string }
  | { kind: "groupRest"; groupId: string; seconds: number | null }
  | { kind: "memberOrder"; groupId: string; ids: string[] };
export type ExerciseChangeReview = {
  id: string;
  name: string;
  completedSets: number;
  stamp: string;
};
export class TrainingChangeNeedsReview extends Error {
  constructor(readonly review: ExerciseChangeReview) {
    super(
      `Revisa las ${review.completedSets} series registradas de ${review.name} antes de continuar.`,
    );
  }
}
function requirePersonal(a: ActiveTraining): asserts a is PersonalActiveTraining {
  if (a.mode !== "real" || a.routine.version !== 2 || a.draft.version !== 3)
    throw Error("Solo puedes reorganizar un entrenamiento personal o libre.");
  if (a.draft.status !== "in_progress")
    throw Error("Retoma un entrenamiento en curso antes de reorganizarlo.");
  if (a.pause?.pausedAtMs != null)
    throw Error("El entrenamiento está en pausa. Reanuda para organizar ejercicios.");
}
export function reviewTrainingExercise(a: ActiveTraining, id: string): ExerciseChangeReview {
  requirePersonal(a);
  const index = a.draft.exercises.findIndex((e) => e.sessionExerciseId === id);
  const exercise = a.draft.exercises[index],
    context = a.routine.exercises[index];
  if (!exercise || !context || context.sessionExerciseId !== id)
    throw Error("Ese ejercicio ya no está en el registro.");
  return {
    id,
    name: exercise.name,
    completedSets: exercise.sets.filter((s) => s.done).length,
    stamp: JSON.stringify({ exercise, context }),
  };
}
function confirm(a: PersonalActiveTraining, operation: { id: string; confirmedStamp?: string }) {
  const review = reviewTrainingExercise(a, operation.id);
  if (operation.confirmedStamp !== undefined && operation.confirmedStamp !== review.stamp)
    throw Error("El ejercicio cambió desde la revisión. Vuelve a revisarlo antes de continuar.");
  if (review.completedSets > 0 && operation.confirmedStamp === undefined)
    throw new TrainingChangeNeedsReview(review);
}
export function trainingLayout(a: PersonalActiveTraining): ExerciseLayout {
  return a.draft.exercises.map((e) => ({
    id: e.sessionExerciseId,
    name: e.name,
    supersetId: e.supersetId ?? null,
    supersetRestSeconds: e.supersetRestSeconds ?? null,
  }));
}
function choice(
  entry: MobileCatalogEntry,
  rowId: string,
  old?: PersonalTrainingContext["exercises"][number],
) {
  return {
    sessionExerciseId: rowId,
    exerciseId: entry.id,
    name: entry.name,
    isBodyweight: entry.isBodyweight,
    prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: null },
    lastWeightKg: null,
    note: null,
    restSeconds: 90,
    supersetId: old?.supersetId ?? null,
    supersetRestSeconds: old?.supersetId ? (old.supersetRestSeconds ?? null) : null,
  };
}
function finish(
  a: PersonalActiveTraining,
  routine: PersonalTrainingContext,
  draft: PersonalTrainingDraft,
  now: Date,
): PersonalActiveTraining {
  if (!validSupersetLayout(draft.exercises.map((e) => ({ id: e.sessionExerciseId, ...e }))))
    throw Error("Revisa los grupos antes de guardar la organización.");
  const focused = a.draft.exercises[a.activeIndex]?.sessionExerciseId;
  let activeIndex = draft.exercises.findIndex((e) => e.sessionExerciseId === focused);
  if (activeIndex < 0) {
    activeIndex = Math.max(0, Math.min(a.activeIndex, draft.exercises.length - 1));
    const start = activeIndex;
    for (let offset = 0; offset < draft.exercises.length; offset++) {
      const index = (start + offset) % draft.exercises.length,
        exercise = draft.exercises[index];
      if (!exercise.skipped && exercise.sets.some((s) => !s.done)) {
        activeIndex = index;
        break;
      }
    }
  }
  return {
    ...a,
    routine: personalContextSchema.parse(routine),
    draft: personalTrainingDraftSchema.parse({ ...draft, updatedAt: now.toISOString() }),
    activeIndex,
  };
}
function applyLayout(
  a: PersonalActiveTraining,
  layout: ExerciseLayout,
  now: Date,
): PersonalActiveTraining {
  const contexts = new Map(a.routine.exercises.map((e) => [e.sessionExerciseId, e]));
  const drafts = new Map(a.draft.exercises.map((e) => [e.sessionExerciseId, e]));
  const routine = {
    ...a.routine,
    exercises: layout.map((row) => ({
      ...contexts.get(row.id)!,
      supersetId: row.supersetId ?? null,
      supersetRestSeconds: row.supersetId ? (row.supersetRestSeconds ?? null) : null,
    })),
  };
  const draft = {
    ...a.draft,
    exercises: layout.map((row) => ({
      ...drafts.get(row.id)!,
      supersetId: row.supersetId ?? undefined,
      supersetRestSeconds: row.supersetId ? (row.supersetRestSeconds ?? undefined) : undefined,
    })),
  };
  return finish(a, routine, draft, now);
}
export function changeTrainingStructure(
  a: ActiveTraining,
  op: TrainingStructureChange,
  now: Date,
  uuid: () => string,
): PersonalActiveTraining {
  requirePersonal(a);
  if (op.kind === "add") {
    if (!op.entries.length) throw Error("Selecciona al menos un ejercicio.");
    if (a.draft.exercises.length + op.entries.length > 15)
      throw Error("Máximo 15 ejercicios por entrenamiento.");
    const entries = z.array(mobileCatalogEntrySchema).parse(op.entries);
    const additions = entries.map((e) => choice(e, uuid()));
    return finish(
      a,
      { ...a.routine, exercises: [...a.routine.exercises, ...additions] },
      { ...a.draft, exercises: [...a.draft.exercises, ...prefillDraftExercises(additions)] },
      now,
    );
  }
  if (op.kind === "replace") {
    const entry = mobileCatalogEntrySchema.parse(op.entry);
    const index = a.draft.exercises.findIndex((e) => e.sessionExerciseId === op.id);
    if (index < 0) throw Error("Ese ejercicio ya no está en el registro.");
    if (a.draft.exercises[index].exerciseId === entry.id) return a;
    confirm(a, op);
    const target = choice(entry, op.id, a.routine.exercises[index]);
    const replacement = prefillDraftExercises([target])[0];
    const seed = uuid();
    replacement.sets = replacement.sets.map((s, i) => ({ ...s, id: `${seed}-${i + 1}` }));
    return finish(
      a,
      { ...a.routine, exercises: a.routine.exercises.map((e, i) => (i === index ? target : e)) },
      { ...a.draft, exercises: a.draft.exercises.map((e, i) => (i === index ? replacement : e)) },
      now,
    );
  }
  const before = trainingLayout(a);
  let next: ExerciseLayout;
  switch (op.kind) {
    case "remove":
      confirm(a, op);
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
  return next === before ? a : applyLayout(a, next, now);
}
