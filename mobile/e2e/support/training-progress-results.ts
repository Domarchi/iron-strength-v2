import { createHash } from "node:crypto";
import {
  buildTrainingProgress,
  type TrainingProgressSource,
} from "../../../src/domain/training-progress";
import { legacyTrainingSet } from "../../../src/domain/training-metrics";
import type { MobileWorkout } from "../../../src/lib/mobile/contracts";
import type { TypedWorkout } from "../../../src/lib/mobile/typed-recording-contracts";
import { trainingProgressSchema } from "../../../src/lib/mobile/training-progress-contracts";
export function fixtureTrainingSetId(workoutId: string, index: number) {
  const h = createHash("sha256").update(`${workoutId}:${index}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** A real contract2 snapshot from complete fixture results, never inferred from aggregate PRs. */
export function progressFromResults(
  userId: string,
  results: (MobileWorkout | TypedWorkout)[],
  today: string,
) {
  const unique = new Map(results.map((r) => [r.workout.id, r]));
  const source: TrainingProgressSource = {
    version: 1,
    userId,
    today,
    workouts: [...unique.values()].map((result) => {
      const w = result.workout;
      return {
        id: w.id,
        startedAt: w.startedAt,
        date: w.performedOn,
        sourceKind: w.sourceKind ?? "assigned",
        title: w.title ?? null,
        sessionLabel: w.sessionLabel,
        durationSeconds: w.durationSeconds,
        perceivedEffort: w.perceivedEffort,
        note: w.note,
        sets:
          result.version === 3
            ? result.workout.exercises.flatMap((e) =>
                e.sets.map((set) => ({
                  id: set.id,
                  exerciseId: e.exerciseId,
                  name: e.name,
                  muscleGroup: null,
                  position: e.position,
                  setNumber: set.setNumber,
                  metrics: set.metrics,
                  setType: set.setType,
                  effort: set.effort,
                })),
              )
            : result.workout.exercises.flatMap((e) =>
                e.sets.map((set) => {
                  const { setType, effort, ...metrics } = legacyTrainingSet(set);
                  return {
                    id: set.id,
                    exerciseId: e.exerciseId,
                    name: e.name,
                    muscleGroup: null,
                    position: e.position,
                    setNumber: set.setNumber,
                    metrics,
                    setType,
                    effort,
                  };
                }),
              ),
      };
    }),
  };
  return trainingProgressSchema.parse({
    version: 2,
    userId,
    today,
    ...buildTrainingProgress(source),
  });
}
