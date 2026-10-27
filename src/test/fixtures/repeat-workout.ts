import type { MobileWorkout } from "../../lib/mobile/contracts";
import type { MobileCatalogEntry } from "../../lib/mobile/exercise-contracts";
import { recordingFixture } from "./workout-recording";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function repeatWorkoutFixture() {
  const recorded = recordingFixture();
  const catalog: MobileCatalogEntry[] = recorded.structure.exercises.map((e, i) => ({
    id: e.exerciseId,
    name: i ? "Remo" : "Press",
    isBodyweight: false,
    equipment: "Barra",
    muscleGroup: i ? "Espalda" : "Pecho",
    progressionIncrementKg: 2.5,
  }));
  const workout: MobileWorkout["workout"] = {
    id: recorded.id,
    sourceKind: "personal",
    title: "Superior",
    personalRoutineId: id(2000),
    personalRoutineRevision: 4,
    programName: null,
    sessionLabel: null,
    startedAt: "2026-10-26T12:00:00Z",
    performedOn: "2026-10-26",
    durationSeconds: 600,
    perceivedEffort: 8,
    note: "Solo anterior",
    summary: { workingSets: 2, volumeKg: 480, bodyweightReps: 0, exerciseCount: 2 },
    structure: recorded.structure,
    exercises: recorded.structure.exercises.map((e, i) => ({
      position: i,
      exerciseId: e.exerciseId,
      name: catalog[i].name,
      sets: [{ id: id(1000 + i), setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
    })),
  };
  return { workout, catalog };
}
