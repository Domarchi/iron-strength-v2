import { assignedTrainingFixture, assignedId as id } from "./assigned-training";
import type { RecordType } from "../../domain/training-metrics";
export function trainingDownloadFixture(kind: RecordType = "duration") {
  const c = assignedTrainingFixture(kind);
  if (kind?.includes("duration")) c.exercises[0].prescribed.target.targetDurationSeconds = 60;
  const exercise = {
    id: id(5),
    name: "Ejercicio",
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: false,
    progressionIncrementKg: 2.5,
    recordType: kind,
  };
  return {
    version: 1,
    userId: id(1),
    downloadedAt: "2026-10-29T12:00:00Z",
    catalog: { version: 2, exercises: [exercise] },
    library: {
      version: 2,
      userId: id(1),
      folders: [],
      routines: [
        {
          id: id(9),
          name: "Personal",
          folderId: null,
          position: 0,
          revision: 1,
          createdAt: "2026-10-27T12:00:00Z",
          updatedAt: "2026-10-27T12:00:00Z",
          items: [
            {
              ...exercise,
              id: id(10),
              exerciseId: exercise.id,
              position: 0,
              prescribed: c.exercises[0].prescribed,
              note: "Control",
              restSeconds: 45,
              supersetId: null,
              supersetRestSeconds: null,
            },
          ],
        },
      ],
    },
    week: {
      program: {
        id: id(2),
        name: "Base",
        startDate: "2026-10-19",
        endsOn: "2026-11-15",
        weeksCount: 4,
      },
      weekNumber: 2,
      weekStart: "2026-10-26",
      weekEnd: "2026-11-01",
      sessionCount: 1,
      sessions: [{ weekday: 1, context: c }],
    },
    history: { [id(5)]: { version: 2, exercise, history: { items: [], nextCursor: null } } },
  };
}
