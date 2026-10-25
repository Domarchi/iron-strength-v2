import type { WeekPackage } from "../../lib/offline/package";
export const downloadId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function weekDownloadFixture(
  userId = downloadId(1),
  downloadedAt = "2026-10-24T12:00:00Z",
): WeekPackage {
  const base = { isBodyweight: false, lastWeightKg: 50, note: null, last: null, suggestion: null };
  return {
    version: 2,
    userId,
    downloadedAt,
    program: {
      id: downloadId(2),
      name: "Fuerza",
      startDate: "2026-10-19",
      endsOn: "2026-11-01",
      weeksCount: 2,
    },
    weekNumber: 1,
    weekStart: "2026-10-19",
    weekEnd: "2026-10-25",
    sessions: [
      {
        revision: 2,
        weekday: 1,
        context: {
          session: {
            id: downloadId(3),
            label: "A",
            title: "Piernas",
            programId: downloadId(2),
            programName: "Fuerza",
            weekNumber: 1,
            weeksCount: 2,
          },
          exercises: [
            {
              ...base,
              sessionExerciseId: downloadId(4),
              exerciseId: downloadId(5),
              name: "Sentadilla",
              prescribed: {
                sets: 2,
                repsMin: 6,
                repsMax: 10,
                targetWeightKg: null,
                series: [
                  { repsMin: 6, repsMax: 8, targetWeightKg: 55 },
                  { repsMin: 8, repsMax: 10, targetWeightKg: 50 },
                ],
              },
              supersetId: downloadId(8),
              supersetRestSeconds: 60,
              alternatives: [
                {
                  ...base,
                  sessionExerciseId: downloadId(4),
                  exerciseId: downloadId(6),
                  name: "Prensa",
                  prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
                },
              ],
            },
            {
              ...base,
              sessionExerciseId: downloadId(7),
              exerciseId: downloadId(9),
              name: "Remo",
              prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 40 },
              supersetId: downloadId(8),
              supersetRestSeconds: 60,
            },
          ],
        },
      },
    ],
    history: Object.fromEntries(
      [5, 6, 9].map((n) => [downloadId(n), { items: [], nextCursor: null }]),
    ),
  };
}
