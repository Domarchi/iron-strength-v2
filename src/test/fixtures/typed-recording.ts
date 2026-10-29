import { recordingFixture } from "./workout-recording";
import { typedRecordingPayloadSchema } from "../../lib/mobile/typed-recording-contracts";
export function typedRecordingFixture(source: "assigned" | "personal" | "free" = "free") {
  const legacy = recordingFixture(source);
  return typedRecordingPayloadSchema.parse({
    ...legacy,
    version: 3,
    workout: {
      ...legacy.workout,
      version: 2,
      exerciseNotes: legacy.structure.exercises.map((row) => ({
        sessionExerciseId: row.id,
        note: null,
      })),
      sets: legacy.workout.sets.map(({ weightKg, reps, isWarmup, ...set }) => ({
        ...set,
        metrics: { recordType: null, weightKg, reps, durationSeconds: null, distanceMeters: null },
        setType: isWarmup ? "warmup" : "working",
        effort: null,
      })),
    },
    structure: {
      version: 2,
      exercises: legacy.structure.exercises.map((row) => ({
        ...row,
        prescribed: {
          recordType: null,
          sets: row.prescribed.sets,
          target: {
            repsMin: row.prescribed.repsMin,
            repsMax: row.prescribed.repsMax,
            targetWeightKg: row.prescribed.targetWeightKg,
            targetDurationSeconds: null,
            targetDistanceMeters: null,
          },
          series: null,
        },
      })),
    },
  });
}
