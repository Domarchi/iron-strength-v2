import { z } from "zod";
import { repeatPlanSchema, type RepeatPlan } from "../../../src/domain/workout-repeat";
import {
  personalContextSchema,
  createPersonalTrainingDraft,
  personalTrainingDraftSchema,
} from "./personal-training";

/** Called only after confirmation. The preview itself never allocates IDs or starts time. */
export function createRepeatedTraining(
  value: RepeatPlan,
  input: { userId: string; workoutId: string; now: Date },
  uuid: () => string,
) {
  const plan = repeatPlanSchema.parse(value);
  const userId = z.uuid().parse(input.userId),
    workoutId = z.uuid().parse(input.workoutId);
  const used = new Set(
    [
      plan.sourceWorkoutId,
      ...plan.exercises
        .flatMap((e) => [e.sourceRowId, e.supersetId, ...e.sets.map((s) => s.id)])
        .filter((x): x is string => !!x),
    ].map((id) => id.toLowerCase()),
  );
  if (used.has(workoutId.toLowerCase()))
    throw Error("El entrenamiento nuevo necesita otra identidad.");
  used.add(workoutId.toLowerCase());
  const fresh = () => {
    const id = z.uuid().parse(uuid());
    if (used.has(id.toLowerCase()))
      throw Error("No pudimos crear identificadores independientes. Reintenta.");
    used.add(id.toLowerCase());
    return id;
  };
  const groups = new Map<string, string>();
  const routine = personalContextSchema.parse({
    version: 2,
    origin: { kind: "free" },
    session: { id: null, programId: null, label: "Libre", title: plan.title },
    exercises: plan.exercises.map((e) => {
      let group: string | null = null;
      if (e.supersetId) {
        group = groups.get(e.supersetId) ?? fresh();
        groups.set(e.supersetId, group);
      }
      return {
        sessionExerciseId: fresh(),
        exerciseId: e.exerciseId,
        name: e.name,
        isBodyweight: e.isBodyweight,
        prescribed: e.prescribed,
        lastWeightKg: null,
        note: e.note,
        restSeconds: e.restSeconds,
        supersetId: group,
        supersetRestSeconds: e.supersetRestSeconds,
      };
    }),
  });
  const draft = createPersonalTrainingDraft({
    context: routine,
    userId,
    workoutId,
    now: input.now,
  });
  const repeated = personalTrainingDraftSchema.parse({
    ...draft,
    exercises: draft.exercises.map((e, i) => ({
      ...e,
      sets: plan.exercises[i].sets.map((s) => ({
        id: fresh(),
        weight: String(s.weightKg).replace(".", ","),
        reps: String(s.reps),
        done: false,
        isWarmup: s.isWarmup,
      })),
    })),
  });
  return { routine, draft: repeated };
}
