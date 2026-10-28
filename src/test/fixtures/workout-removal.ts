import type {
  WorkoutRemoval,
  WorkoutRemovalSnapshot,
} from "../../lib/mobile/workout-removal-contracts";
import { workoutCorrectionSnapshotFixture, correctionUserId } from "./workout-correction";
export const removalUserId = correctionUserId;
export function workoutRemovalSnapshotFixture(): WorkoutRemovalSnapshot {
  const base = workoutCorrectionSnapshotFixture(),
    w = base.workout;
  return {
    version: 1,
    userId: base.userId,
    today: base.today,
    workout: {
      id: w.id,
      revision: w.revision,
      sourceKind: w.sourceKind,
      title: w.title,
      sessionLabel: w.sessionLabel,
      performedOn: w.performedOn,
      setCount: w.sets.length,
      commentCount: 2,
    },
  };
}
export function workoutRemovalFixture(): WorkoutRemoval {
  const base = workoutRemovalSnapshotFixture();
  return {
    version: 1,
    requestId: "af214a00-0000-4000-8000-000000000005",
    workoutId: base.workout.id,
    expectedRevision: base.workout.revision,
  };
}
