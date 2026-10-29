// Explicit synthetic complete server source. Never used by production as a legacy fallback.
import { bundleSchema } from "../../../src/lib/offline/training-bundle";
import type { WeekPackage } from "../../../src/lib/offline/package";
import { downloadId } from "../../../src/test/fixtures/week-download";
import { assignedFromLegacy } from "./assigned-context";
const catalog = [
  { id: downloadId(5), name: "Sentadilla", muscleGroup: "Piernas" },
  { id: downloadId(6), name: "Prensa", muscleGroup: "Piernas" },
  { id: downloadId(9), name: "Remo", muscleGroup: "Espalda" },
].map((e) => ({
  ...e,
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 2.5,
  recordType: null,
}));
export function completeWeekFixture(pack: WeekPackage) {
  return bundleSchema.parse({
    version: 1,
    userId: pack.userId,
    downloadedAt: pack.downloadedAt,
    catalog: { version: 2, exercises: catalog },
    library: { version: 2, userId: pack.userId, folders: [], routines: [] },
    week: {
      program: pack.program,
      weekNumber: pack.weekNumber,
      weekStart: pack.weekStart,
      weekEnd: pack.weekEnd,
      sessionCount: pack.sessions.length,
      sessions: pack.sessions.map((s) => ({
        weekday: s.weekday ?? null,
        context: assignedFromLegacy(
          { version: 1, ...s.context },
          pack.userId,
          pack.program,
          s.revision,
          pack.history,
        ),
      })),
    },
    history: Object.fromEntries(
      catalog.map((exercise) => [
        exercise.id,
        {
          version: 2,
          exercise,
          history: {
            nextCursor: pack.history[exercise.id]?.nextCursor ?? null,
            items: (pack.history[exercise.id]?.items ?? []).map((row) => ({
              id: row.id,
              startedAt: row.startedAt,
              date: row.date,
              sessionLabel: row.sessionLabel,
              title: null,
              sourceKind: "assigned",
              exerciseNotes: [],
              sets: row.sets.map((set) => ({
                id: set.id,
                position: set.position,
                setNumber: set.setNumber,
                metrics: {
                  recordType: null,
                  weightKg: set.weightKg,
                  reps: set.reps,
                  durationSeconds: null,
                  distanceMeters: null,
                },
                setType: set.isWarmup ? "warmup" : "working",
                effort: null,
              })),
            })),
          },
        },
      ]),
    ),
  });
}
