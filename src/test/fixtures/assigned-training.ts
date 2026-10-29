import { defaultPrescriptionInput, parsePrescriptionInput } from "../../domain/prescription-input";
import { type RecordType } from "../../domain/training-metrics";
export const assignedId = (n: number) => `ad219000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function assignedTrainingFixture(kind: RecordType = "duration") {
  const id = assignedId;
  return {
    version: 5 as const,
    previousSets: [],
    userId: id(1),
    origin: { kind: "assigned" as const, programId: id(2), programSessionId: id(3) },
    title: "Fuerza y control",
    sessionLabel: "A",
    session: {
      id: id(3),
      label: "A",
      title: "Fuerza y control",
      programId: id(2),
      programName: "Base",
      weekNumber: 2,
      weeksCount: 4,
      revision: 7,
      startDate: "2026-10-19",
      endsOn: "2026-11-15",
    },
    exercises: [
      {
        sessionExerciseId: id(4),
        exerciseId: id(5),
        name: "Ejercicio",
        isBodyweight: false,
        prescribed: parsePrescriptionInput(defaultPrescriptionInput(kind)),
        lastMetrics: null,
        note: "Control",
        restSeconds: 45,
        supersetId: null,
        supersetRestSeconds: null,
        alternatives: [],
      },
    ],
  };
}
