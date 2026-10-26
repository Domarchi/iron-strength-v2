import { z } from "zod";
import { mobileRoutineSchema } from "../../../src/lib/mobile/contracts";
import type { PersonalRoutine } from "../../../src/lib/mobile/personal-contracts";
import {
  personalWorkoutOriginSchema,
  personalWorkoutPayloadSchema,
} from "../../../src/lib/mobile/personal-workout-contracts";
import { workoutDraftSchema } from "../../../src/lib/workout/draft";
import { workoutPayloadSchema } from "../../../src/lib/workout/payload";
import { canComplete, prefillDraftExercises } from "../../../src/lib/workout/runner-state";
export const personalContextSchema = z
  .object({
    version: z.literal(2),
    origin: personalWorkoutOriginSchema,
    session: z
      .object({
        id: z.null(),
        programId: z.null(),
        label: z.enum(["Personal", "Libre"]),
        title: z.string().trim().min(1).max(100),
      })
      .strict(),
    exercises: mobileRoutineSchema.shape.exercises,
  })
  .strict();
export const personalTrainingDraftSchema = z
  .object({
    ...workoutDraftSchema.shape,
    version: z.literal(3),
    programId: z.null(),
    plannedSessionId: z.null(),
    origin: personalWorkoutOriginSchema,
    title: z.string().trim().min(1).max(100),
    exercises: workoutDraftSchema.shape.exercises.max(15),
  })
  .strict();
export const nativeWorkoutDraftSchema = z.union([workoutDraftSchema, personalTrainingDraftSchema]);
export type NativeWorkoutDraft = z.infer<typeof nativeWorkoutDraftSchema>;
export type PersonalTrainingContext = z.infer<typeof personalContextSchema>;
export type PersonalTrainingDraft = z.infer<typeof personalTrainingDraftSchema>;
// A tagged payload, including an unknown future version, can never fall through to legacy parsing.
export const nativeWorkoutPayloadSchema = z.union([
  personalWorkoutPayloadSchema,
  workoutPayloadSchema.extend({ version: z.never().optional(), origin: z.never().optional() }),
]);
export type NativeWorkoutPayload = z.infer<typeof nativeWorkoutPayloadSchema>;
export const isPersonalWorkoutPayload = (
  payload: NativeWorkoutPayload,
): payload is z.infer<typeof personalWorkoutPayloadSchema> => payload.version === 1;
export function personalRoutineContext(routine: PersonalRoutine): PersonalTrainingContext {
  if (!routine.items.length) throw Error("Agrega ejercicios a la rutina antes de empezar.");
  return personalContextSchema.parse({
    version: 2,
    origin: { kind: "personal", routineId: routine.id, revision: routine.revision },
    session: { id: null, programId: null, label: "Personal", title: routine.name },
    exercises: routine.items.map((item) => ({
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      name: item.name,
      isBodyweight: item.isBodyweight,
      prescribed: {
        sets: item.sets,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        targetWeightKg: item.targetWeightKg,
        series: item.series?.map((s) => ({ ...s })) ?? null,
      },
      lastWeightKg: null,
      note: item.note,
      restSeconds: item.restSeconds,
      supersetId: item.supersetId,
      supersetRestSeconds: item.supersetRestSeconds,
    })),
  });
}
export function freeRoutineContext(title = "Entrenamiento libre"): PersonalTrainingContext {
  return personalContextSchema.parse({
    version: 2,
    origin: { kind: "free" },
    session: {
      id: null,
      programId: null,
      label: "Libre",
      title: title.trim() || "Entrenamiento libre",
    },
    exercises: [],
  });
}
export function createPersonalTrainingDraft(input: {
  context: PersonalTrainingContext;
  userId: string;
  workoutId: string;
  now: Date;
}): PersonalTrainingDraft {
  const context = personalContextSchema.parse(input.context);
  return personalTrainingDraftSchema.parse({
    version: 3,
    programId: null,
    plannedSessionId: null,
    origin: context.origin,
    title: context.session.title,
    workoutId: input.workoutId,
    userId: input.userId,
    sessionLabel: context.session.label,
    startedAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    status: "in_progress",
    exercises: prefillDraftExercises(
      context.exercises.map((e) => ({
        ...e,
        lastWeightKg: e.lastWeightKg ?? null,
        alternatives: e.alternatives?.map((a) => ({ ...a, lastWeightKg: a.lastWeightKg ?? null })),
      })),
    ),
  });
}
export function buildPersonalTrainingPayload(draft: PersonalTrainingDraft, now: Date) {
  const sets: z.infer<typeof personalWorkoutPayloadSchema>["sets"] = [];
  let invalid = false;
  draft.exercises.forEach((exercise, position) => {
    if (exercise.skipped) return;
    let setNumber = 0;
    for (const set of exercise.sets) {
      if (!set.done) continue;
      if (!canComplete(exercise, set)) {
        invalid = true;
        continue;
      }
      sets.push({
        exerciseId: exercise.exerciseId,
        position,
        setNumber: ++setNumber,
        weightKg: set.weight.trim() === "" ? 0 : Number(set.weight.trim().replace(",", ".")),
        reps: Number(set.reps.trim()),
        isWarmup: set.isWarmup,
      });
    }
  });
  if (invalid) return { ok: false as const, reason: "invalid" as const };
  if (!sets.length) return { ok: false as const, reason: "no_sets" as const };
  const parsed = personalWorkoutPayloadSchema.safeParse({
    version: 1,
    id: draft.workoutId,
    origin: draft.origin,
    title: draft.title,
    startedAt: draft.startedAt,
    finishedAt: draft.finishedAt ?? now.toISOString(),
    durationSeconds:
      draft.durationSeconds ??
      Math.max(0, Math.floor((now.getTime() - Date.parse(draft.startedAt)) / 1000)),
    ...(draft.perceivedEffort !== undefined ? { perceivedEffort: draft.perceivedEffort } : {}),
    ...(draft.note !== undefined ? { note: draft.note?.trim() || null } : {}),
    sets,
  });
  return parsed.success
    ? { ok: true as const, payload: parsed.data }
    : { ok: false as const, reason: "invalid" as const };
}
