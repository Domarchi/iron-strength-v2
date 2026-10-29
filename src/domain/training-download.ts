import { z } from "zod";
import { santiagoDate } from "./dates";
import { trainingHistorySourceSchema } from "./training-history";
import { bundleSchema, type Bundle } from "../lib/offline/training-bundle";
import {
  typedCatalogEntrySchema,
  typedExerciseDetailSchema,
  type TypedExerciseDetail,
} from "../lib/mobile/typed-exercise-contracts";
import { exerciseHistoryCursorString } from "../lib/mobile/exercise-contracts";
import {
  assignedContextSchema,
  type AssignedTrainingContext,
} from "../lib/workout/training-context";
const sourceSchema = z.strictObject({
  ...bundleSchema.shape,
  history: trainingHistorySourceSchema,
  references: z
    .array(typedCatalogEntrySchema)
    .max(20000)
    .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length),
});
/** Pure projection of one SQL snapshot. No second query can mix revisions or accounts. */
export function projectCompleteTrainingDownload(value: unknown, owner: string): Bundle {
  const s = sourceSchema.parse(value);
  if (
    s.userId !== owner.toLowerCase() ||
    s.library.userId !== s.userId ||
    s.history.student.id !== s.userId ||
    s.history.today !== santiagoDate(new Date(s.downloadedAt))
  )
    throw Error("Identidad o fecha incompatible");
  const metadata = [...s.catalog.exercises, ...s.references];
  if (new Set(metadata.map((e) => e.id)).size !== metadata.length || metadata.length > 20000)
    throw Error("Referencias incompatibles");
  const wanted = new Set(metadata.map((e) => e.id)),
    histories = new Map<string, TypedExerciseDetail["history"]["items"]>();
  // PostgreSQL timestamps retain microseconds; Date.parse alone loses their ordering.
  const precise = (value: string) => {
    const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
    if (fraction.length > 6) throw Error("Precisión temporal incompatible");
    return { second: Math.floor(Date.parse(value) / 1000), fraction: fraction.padEnd(6, "0") };
  };
  const ordered = s.history.workouts
    .map((w) => ({ w, at: precise(w.startedAt) }))
    .toSorted(
      (a, b) =>
        b.at.second - a.at.second ||
        b.at.fraction.localeCompare(a.at.fraction) ||
        b.w.id.localeCompare(a.w.id),
    )
    .map((row) => row.w);
  for (const w of ordered) {
    const grouped = new Map<string, typeof w.sets>();
    for (const row of w.sets)
      if (wanted.has(row.exerciseId)) {
        const rows = grouped.get(row.exerciseId) ?? [];
        rows.push(row);
        grouped.set(row.exerciseId, rows);
      }
    for (const [exerciseId, rows] of grouped) {
      const items = histories.get(exerciseId) ?? [];
      if (items.length >= 11) continue;
      const exerciseNotes =
        w.structure?.version === 2
          ? w.structure.exercises.flatMap((r, position) =>
              r.exerciseId === exerciseId
                ? [{ position, note: w.exerciseNotes![position].note }]
                : [],
            )
          : [];
      items.push({
        id: w.id,
        startedAt: w.startedAt,
        date: w.date,
        sessionLabel: w.sessionLabel,
        sourceKind: w.sourceKind,
        title: w.title,
        exerciseNotes,
        sets: rows
          .toSorted((a, b) => a.position - b.position || a.setNumber - b.setNumber)
          .map((r) => ({
            id: r.id,
            position: r.position,
            setNumber: r.setNumber,
            metrics: r.metrics,
            setType: r.setType,
            effort: r.effort,
          })),
      });
      histories.set(exerciseId, items);
    }
  }
  const history: Bundle["history"] = {};
  for (const exercise of metadata) {
    const all = histories.get(exercise.id) ?? [],
      items = all.slice(0, 10),
      last = items.at(-1);
    history[exercise.id] = typedExerciseDetailSchema.parse({
      version: 2,
      exercise,
      history: {
        items,
        nextCursor: all.length > 10 && last ? exerciseHistoryCursorString(last) : null,
      },
    });
  }
  const withReference = (context: AssignedTrainingContext) => {
    const previous = new Map<string, AssignedTrainingContext["previousSets"][number]>();
    const choice = (r: AssignedTrainingContext["exercises"][number]["alternatives"][number]) => {
      const key = JSON.stringify([r.exerciseId, r.prescribed.recordType]);
      for (const item of history[r.exerciseId]?.history.items ?? []) {
        const sets = item.sets
          .filter((s) => s.metrics.recordType === r.prescribed.recordType)
          .map((s) => ({ ...s.metrics, setType: s.setType, effort: s.effort }));
        const last = sets.findLast((s) => s.setType !== "warmup");
        if (!last) continue;
        previous.set(key, { exerciseId: r.exerciseId, recordType: r.prescribed.recordType, sets });
        const lastMetrics = {
          recordType: last.recordType,
          weightKg: last.weightKg,
          reps: last.reps,
          durationSeconds: last.durationSeconds,
          distanceMeters: last.distanceMeters,
        };
        return { ...r, lastMetrics };
      }
      return { ...r, lastMetrics: null };
    };
    const exercises = context.exercises.map((r) => ({
      ...choice(r),
      alternatives: r.alternatives.map(choice),
    }));
    return assignedContextSchema.parse({
      ...context,
      exercises,
      previousSets: [...previous.values()],
    });
  };
  return bundleSchema.parse({
    version: 1,
    userId: s.userId,
    downloadedAt: s.downloadedAt,
    catalog: s.catalog,
    library: s.library,
    week: s.week
      ? {
          ...s.week,
          sessions: s.week.sessions.map((row) => ({ ...row, context: withReference(row.context) })),
        }
      : null,
    history,
  });
}
