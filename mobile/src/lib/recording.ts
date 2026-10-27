import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
import {
  recordingPayloadSchema,
  type RecordingPayload,
} from "../../../src/lib/mobile/recording-contracts";
import { buildPayload, canComplete } from "../../../src/lib/workout/runner-state";
import {
  buildPersonalTrainingPayload,
  nativeWorkoutDraftSchema,
  personalContextSchema,
  type NativeWorkoutDraft,
  type PersonalTrainingContext,
} from "./personal-training";

type Prescription = MobileRoutine["exercises"][number]["prescribed"];
const prescription = (p: Prescription) => ({
  sets: p.sets,
  repsMin: p.repsMin,
  repsMax: p.repsMax,
  targetWeightKg: p.targetWeightKg,
  series: p.series?.map((s) => ({ ...s })) ?? null,
});
type Result =
  { ok: true; payload: RecordingPayload } | { ok: false; reason: "invalid" | "no_sets" };
/** Only for a new close. Frozen legacy documents keep their original body and route. */
export function buildTrainingRecording(
  context: MobileRoutine | PersonalTrainingContext,
  content: NativeWorkoutDraft,
  now: Date,
): Result {
  const invalid = { ok: false as const, reason: "invalid" as const };
  try {
    const routine =
      context.version === 2
        ? personalContextSchema.parse(context)
        : mobileRoutineSchema.parse(context);
    const draft = nativeWorkoutDraftSchema.parse(content);
    const personal = routine.version === 2;
    if (personal !== (draft.version === 3) || routine.session.label !== draft.sessionLabel)
      return invalid;
    if (routine.version === 2 && draft.version === 3) {
      if (
        JSON.stringify(routine.origin) !== JSON.stringify(draft.origin) ||
        routine.session.title !== draft.title
      )
        return invalid;
    } else if (routine.version === 1 && draft.version !== 3) {
      if (
        routine.session.id !== draft.plannedSessionId ||
        routine.session.programId !== draft.programId ||
        routine.session.label !== draft.sessionLabel
      )
        return invalid;
    }
    if (routine.exercises.length !== draft.exercises.length) return invalid;
    for (const [i, exercise] of draft.exercises.entries()) {
      const source = routine.exercises[i];
      if (
        source.sessionExerciseId !== exercise.sessionExerciseId ||
        (source.supersetId ?? null) !== (exercise.supersetId ?? null)
      )
        return invalid;
      const choice =
        source.exerciseId === exercise.exerciseId
          ? source
          : !personal
            ? source.alternatives?.find((a) => a.exerciseId === exercise.exerciseId)
            : undefined;
      if (
        !choice ||
        JSON.stringify(prescription(exercise.prescribed)) !==
          JSON.stringify(prescription(choice.prescribed))
      )
        return invalid;
      if (!personal && exercise.original && exercise.original.exerciseId !== source.exerciseId)
        return invalid;
      if (!exercise.skipped && exercise.sets.some((set) => set.done && !canComplete(exercise, set)))
        return invalid;
    }
    const built =
      draft.version === 3 ? buildPersonalTrainingPayload(draft, now) : buildPayload(draft, now);
    if (!built.ok) return built;
    const parsed = recordingPayloadSchema.safeParse({
      version: 2,
      id: draft.workoutId,
      source: routine.version === 2 ? routine.origin.kind : "assigned",
      workout: built.payload,
      structure: {
        version: 1,
        exercises: draft.exercises.map((exercise, i) => {
          const source = routine.exercises[i];
          // Assigned rests describe the coach's prescription, not an adjustment of the timer.
          const rest = personal ? exercise : source;
          return {
            id: exercise.sessionExerciseId,
            exerciseId: exercise.exerciseId,
            prescribedExerciseId: personal ? null : source.exerciseId,
            prescribed: prescription(exercise.prescribed),
            note: source.note,
            restSeconds: rest.restSeconds ?? null,
            supersetId: source.supersetId ?? null,
            supersetRestSeconds: rest.supersetRestSeconds ?? null,
          };
        }),
      },
    });
    return parsed.success ? { ok: true, payload: parsed.data } : invalid;
  } catch {
    return invalid;
  }
}
