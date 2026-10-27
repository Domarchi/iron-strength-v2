const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function recordingFixture(source: "assigned" | "personal" | "free" = "free") {
  const structure = {
    version: 1 as const,
    exercises: [0, 1].map((index) => ({
      id: id(100 + index),
      exerciseId: id(800 + index),
      prescribedExerciseId: source === "assigned" ? id(800 + index) : null,
      prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 30, series: null },
      note: "Controlado",
      restSeconds: 90,
      supersetId: id(400),
      supersetRestSeconds: 60,
    })),
  };
  const header = {
    id: id(1),
    startedAt: "2026-10-26T12:00:00Z",
    finishedAt: "2026-10-26T12:30:00Z",
    durationSeconds: 1800,
  };
  const sets = [0, 1].map((position) => ({
    exerciseId: id(800 + position),
    position,
    setNumber: 1,
    weightKg: 30,
    reps: 8,
    isWarmup: false,
  }));
  if (source === "assigned")
    return {
      version: 2 as const,
      id: header.id,
      source,
      structure,
      workout: {
        ...header,
        programId: id(500),
        programSessionId: id(600),
        sessionLabel: "A",
        sets: sets.map((row, index) => ({
          ...row,
          exerciseName: index ? "Remo" : "Press",
          sessionExerciseId: id(100 + index),
          prescribedExerciseId: id(800 + index),
        })),
      },
    };
  return {
    version: 2 as const,
    id: header.id,
    source,
    structure,
    workout: {
      ...header,
      version: 1 as const,
      title: "Superior",
      origin:
        source === "free"
          ? { kind: "free" as const }
          : { kind: "personal" as const, routineId: id(700), revision: 3 },
      sets,
    },
  };
}
