import type {
  WorkoutCorrection,
  WorkoutCorrectionSnapshot,
} from "../../lib/mobile/workout-correction-contracts";
const id = (n: number) => `af214a00-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const correctionUserId = id(1);
export function workoutCorrectionSnapshotFixture(): WorkoutCorrectionSnapshot {
  return {
    version: 1,
    userId: correctionUserId,
    today: "2026-10-28",
    workout: {
      id: id(2),
      revision: 3,
      sourceKind: "assigned",
      title: null,
      sessionLabel: "A",
      performedOn: "2026-10-27",
      startedAt: "2026-10-27T15:00:00Z",
      durationSeconds: 3600,
      structure: null,
      perceivedEffort: null,
      note: null,
      exerciseNotes: null,
      sets: [
        {
          id: id(3),
          position: 0,
          setNumber: 1,
          exerciseId: id(4),
          exerciseName: "Nombre histórico",
          prescribedExerciseId: null,
          prescribedExerciseName: null,
          sessionExerciseId: null,
          metrics: {
            recordType: null,
            weightKg: 60,
            reps: 8,
            durationSeconds: null,
            distanceMeters: null,
          },
          setType: null,
          effort: null,
          isWarmup: false,
        },
      ],
    },
  };
}
export function workoutCorrectionFixture(): WorkoutCorrection {
  const base = workoutCorrectionSnapshotFixture();
  return {
    version: 1,
    requestId: id(5),
    workoutId: base.workout.id,
    expectedRevision: base.workout.revision,
    perceivedEffort: 7,
    note: "Corrección",
    exerciseNotes: null,
    sets: base.workout.sets.map((s) => ({
      id: s.id,
      metrics: { ...s.metrics, weightKg: 62.5 },
      setType: null,
      effort: null,
      isWarmup: false,
    })),
  };
}
