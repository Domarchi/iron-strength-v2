import { addDays, type DateString } from "./dates";
import { trainingPeriodSummary, type TrainingProgress } from "./training-progress";

/** All record dimensions share the typed historical rules, including same-instant batches. */
export function trainingRecordCount(progress: TrainingProgress, workoutId: string): number {
  return progress.exercises.reduce(
    (sum, exercise) =>
      sum +
      exercise.points
        .filter((p) => p.workoutId === workoutId)
        .reduce((n, p) => n + p.records.length, 0),
    0,
  );
}
export function summarizeTrainingWeek(
  progress: TrainingProgress,
  weekStart: DateString,
  today: DateString,
) {
  const weekEnd = addDays(weekStart, 6),
    summary = trainingPeriodSummary(progress.activity, today, weekStart, weekEnd),
    selected = new Set(summary.workoutIds);
  return {
    weekStart,
    weekEnd,
    workoutCount: summary.workoutCount,
    trainedDays: summary.activeDays,
    records: progress.exercises.reduce(
      (n, e) =>
        n +
        e.points.reduce(
          (count, p) => count + (selected.has(p.workoutId) ? p.records.length : 0),
          0,
        ),
      0,
    ),
    volumeKg: summary.totals.externalVolumeKg,
    bodyweightReps: summary.totals.bodyweightReps,
    workingSets: summary.totals.workingSets,
    recordedSeconds: summary.totals.durationSeconds,
    distanceMeters: summary.totals.distanceMeters,
    durationSeconds: summary.durationSeconds,
    workoutIds: summary.workoutIds,
    workouts: progress.activity
      .filter((w) => selected.has(w.id))
      .map((w) => ({
        id: w.id,
        date: w.date,
        title: w.title,
        sourceKind: w.sourceKind,
        sessionLabel: w.sessionLabel,
      })),
  };
}
