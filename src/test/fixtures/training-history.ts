import { trainingMetricCases } from "./training-metrics";
const id = (n: number) => `af219000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function trainingHistoryFixture() {
  const owner = id(900),
    structure = {
      version: 2 as const,
      exercises: Array.from({ length: 10 }, (_, i) => {
        const m = trainingMetricCases[i % 9];
        return {
          id: id(100 + i),
          exerciseId: id(200 + (i % 9)),
          prescribedExerciseId: null,
          note: "Objetivo propio",
          restSeconds: 60,
          supersetId: null,
          supersetRestSeconds: null,
          prescribed: {
            recordType: m.recordType,
            sets: 2,
            series: null,
            target: {
              repsMin: m.reps === null ? null : 8,
              repsMax: m.reps === null ? null : 12,
              targetWeightKg: m.weightKg,
              targetDurationSeconds: m.durationSeconds,
              targetDistanceMeters: m.distanceMeters,
            },
          },
        };
      }),
    };
  return {
    version: 1 as const,
    student: { id: owner, name: "Alumno de prueba" },
    today: "2026-10-29",
    workouts: [
      {
        id: id(1),
        studentId: owner,
        startedAt: "2026-10-26T12:00:00Z",
        finishedAt: "2026-10-26T12:30:00Z",
        date: "2026-10-26",
        durationSeconds: 1800,
        sourceKind: "free" as const,
        title: "Review metrics",
        personalRoutineId: null,
        personalRoutineRevision: null,
        programId: null,
        programSessionId: null,
        programName: null,
        sessionLabel: null,
        perceivedEffort: 8,
        note: "=SUM(1;2)",
        editRevision: 0,
        structure,
        exerciseNotes: structure.exercises.map((r, i) => ({
          sessionExerciseId: r.id,
          note: i === 9 ? "Nota sin series" : i === 0 ? "💪".repeat(500) : null,
        })),
        exerciseNames: trainingMetricCases.map((_, i) => ({
          id: id(200 + i),
          name: `Ejercicio ${i}`,
        })),
        sets: trainingMetricCases.map((m, i) => ({
          id: id(300 + i),
          exerciseId: id(200 + i),
          name: `Ejercicio ${i}`,
          prescribedExerciseId: null,
          prescribedExerciseName: null,
          muscleGroup: "Core",
          position: i,
          setNumber: 1,
          metrics: m,
          setType:
            i === 0
              ? ("drop" as const)
              : i === 1
                ? ("warmup" as const)
                : i === 2
                  ? ("failure" as const)
                  : ("working" as const),
          effort: i === 1 ? null : 8.5,
        })),
      },
    ],
  };
}
