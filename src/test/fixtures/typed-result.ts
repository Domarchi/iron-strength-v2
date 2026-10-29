import { typedRecordingFixture } from "./typed-recording";
import { trainingMetricCases } from "./training-metrics";
import { trainingTotals } from "../../domain/training-metrics";
import { typedWorkoutSchema } from "../../lib/mobile/typed-recording-contracts";
import { typedCatalogSchema } from "../../lib/mobile/typed-exercise-contracts";
const id = (n: number) => `be215000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function typedResultFixture() {
  const source = typedRecordingFixture(),
    rows = trainingMetricCases.map((m, i) => ({
      ...source.structure.exercises[0],
      id: id(100 + i),
      exerciseId: id(200 + i),
      prescribedExerciseId: null,
      supersetId: null,
      supersetRestSeconds: null,
      note: `Indicación ${i}`,
      restSeconds: 90,
      prescribed: {
        recordType: m.recordType,
        sets: 1,
        target: {
          repsMin: m.reps === null ? null : 8,
          repsMax: m.reps === null ? null : 12,
          targetWeightKg: m.weightKg,
          targetDurationSeconds: m.durationSeconds,
          targetDistanceMeters: m.distanceMeters,
        },
        series: null,
      },
    })),
    sets = trainingMetricCases.map((m) => ({ ...m, setType: "working" as const, effort: 8.5 })),
    totals = trainingTotals(sets);
  const catalog = typedCatalogSchema.parse({
    version: 2,
    exercises: rows.map((r, i) => ({
      id: r.exerciseId,
      name: `Movimiento ${i}`,
      muscleGroup: "Core",
      equipment: null,
      isBodyweight: i === 2,
      progressionIncrementKg: 1,
      recordType: r.prescribed.recordType,
    })),
  });
  const result = typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: source.id,
      sourceKind: "free",
      title: "Registro de todos los tipos",
      personalRoutineId: null,
      personalRoutineRevision: null,
      programName: null,
      sessionLabel: null,
      startedAt: "2026-10-27T12:00:00Z",
      performedOn: "2026-10-27",
      durationSeconds: 3600,
      perceivedEffort: 9,
      note: "Nota global propia",
      structure: { version: 2, exercises: rows },
      exercises: rows.map((r, position) => ({
        ...r,
        position,
        name: catalog.exercises[position].name,
        prescribedExerciseName: null,
        athleteNote: `Nota propia ${position}`,
        sets: [
          {
            id: id(300 + position),
            setNumber: 1,
            metrics: trainingMetricCases[position],
            setType: "working",
            effort: 8.5,
          },
        ],
      })),
      summary: {
        workingSets: totals.workingSets,
        volumeKg: totals.externalVolumeKg,
        bodyweightReps: totals.bodyweightReps,
        exerciseCount: rows.length,
        recordedSeconds: totals.durationSeconds,
        distanceMeters: totals.distanceMeters,
      },
    },
  });
  return { result, catalog };
}
