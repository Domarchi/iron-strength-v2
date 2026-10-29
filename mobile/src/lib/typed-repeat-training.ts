import { z } from "zod";
import {
  typedRepeatPlanSchema,
  type TypedRepeatPlan,
} from "../../../src/domain/typed-workout-repeat";
import { createTypedDraft, typedContextSchema, typedDraftSchema } from "./typed-training";

/** Allocates only after confirmation. All execution notes, effort and clocks start fresh. */
export function createTypedRepeatedTraining(
  value: TypedRepeatPlan,
  input: { userId: string; workoutId: string; now: Date },
  uuid: () => string,
) {
  const plan = typedRepeatPlanSchema.parse(value),
    userId = z.uuid().parse(input.userId),
    workoutId = z.uuid().parse(input.workoutId);
  const used = new Set(
    [
      plan.sourceWorkoutId,
      ...plan.exercises.flatMap((e) => [e.sourceRowId, e.supersetId, ...e.sets.map((s) => s.id)]),
    ]
      .filter((v): v is string => v !== null)
      .map((v) => v.toLowerCase()),
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
  const routine = typedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: plan.title,
    sessionLabel: "Libre",
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
        lastMetrics: null,
        note: e.note,
        restSeconds: e.restSeconds,
        supersetId: group,
        supersetRestSeconds: e.supersetRestSeconds,
        alternatives: [],
      };
    }),
  });
  const draft = createTypedDraft({ context: routine, userId, workoutId, now: input.now });
  const text = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  return {
    routine,
    draft: typedDraftSchema.parse({
      ...draft,
      exercises: draft.exercises.map((e, i) => ({
        ...e,
        sets: plan.exercises[i].sets.map((s) => ({
          id: fresh(),
          weight: text(s.metrics.weightKg),
          reps: text(s.metrics.reps),
          duration: text(s.metrics.durationSeconds),
          distance: text(s.metrics.distanceMeters),
          effort: "",
          setType: s.setType,
          done: false,
        })),
      })),
    }),
  };
}
