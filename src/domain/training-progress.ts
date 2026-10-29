import { z } from "zod";
import { addDays, daysBetween, mondayOf } from "./dates";
import { estimated1RM } from "./records";
import { progressPeriods, type ProgressWeeks } from "./progress-period";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingRecordedSetSchema,
  trainingSetDetailsSchema,
  trainingTotals,
  type TrainingMetrics,
} from "./training-metrics";
const uuid = z.uuid();
const sourceKind = z.enum(["assigned", "personal", "free"]);
const sourceSet = z
  .object({
    id: uuid,
    exerciseId: uuid,
    name: z.string().min(1).max(100),
    muscleGroup: z.string().min(1).max(100).nullable(),
    position: z.number().int().nonnegative(),
    setNumber: z.number().int().positive(),
    metrics: trainingMetricsSchema,
    ...trainingSetDetailsSchema.shape,
  })
  .strict();
const sourceWorkout = z
  .object({
    id: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    date: z.iso.date(),
    sourceKind,
    title: z.string().max(100).nullable(),
    sessionLabel: z.string().max(100).nullable(),
    durationSeconds: z.number().int().min(0).max(86400),
    perceivedEffort: z.number().int().min(1).max(10).nullable(),
    note: athleteNoteSchema,
    sets: z
      .array(sourceSet)
      .max(100000)
      .refine((sets) => {
        const ids = new Set<string>(),
          slots = new Set<string>(),
          positions = new Map<number, string>();
        for (const row of sets) {
          const slot = `${row.position}:${row.setNumber}`,
            identity = `${row.exerciseId}:${row.metrics.recordType ?? "legacy"}`;
          if (
            ids.has(row.id) ||
            slots.has(slot) ||
            (positions.has(row.position) && positions.get(row.position) !== identity)
          )
            return false;
          ids.add(row.id);
          slots.add(slot);
          positions.set(row.position, identity);
        }
        return true;
      }),
  })
  .strict();
export const trainingProgressSourceSchema = z
  .object({
    version: z.literal(1),
    userId: uuid,
    today: z.iso.date(),
    workouts: z.array(sourceWorkout).max(10000),
  })
  .strict()
  .refine((s) => {
    const sets = s.workouts.flatMap((w) => w.sets);
    return (
      sets.length <= 100000 &&
      new Set(s.workouts.map((w) => w.id)).size === s.workouts.length &&
      new Set(sets.map((r) => r.id)).size === sets.length
    );
  });
export type TrainingProgressSource = z.infer<typeof trainingProgressSourceSchema>;
export const TRAINING_PROGRESS_METRICS = [
  "weightKg",
  "estimated1RM",
  "reps",
  "assistanceKg",
  "durationSeconds",
  "distanceMeters",
] as const;
export type TrainingProgressMetric = (typeof TRAINING_PROGRESS_METRICS)[number];
export type TrainingProgressTotals = ReturnType<typeof trainingTotals>;
export type TrainingProgressMark = {
  metric: TrainingProgressMetric;
  value: number;
  workoutId: string;
  date: string;
  setId: string;
  metrics: TrainingMetrics;
};
export type TrainingProgressPoint = {
  workoutId: string;
  date: string;
  startedAt: string;
  totals: TrainingProgressTotals;
  marks: TrainingProgressMark[];
  records: (TrainingProgressMark & { previous: number })[];
};
export type TrainingExerciseProgress = {
  exerciseId: string;
  recordType: TrainingMetrics["recordType"];
  name: string;
  lastDate: string;
  workoutCount: number;
  marks: TrainingProgressMark[];
  points: TrainingProgressPoint[];
};
export type TrainingActivity = {
  id: string;
  startedAt: string;
  date: string;
  sourceKind: "assigned" | "personal" | "free";
  title: string | null;
  sessionLabel: string | null;
  durationSeconds: number;
  perceivedEffort: number | null;
  note: string | null;
  totals: TrainingProgressTotals;
  exercises: {
    exerciseId: string;
    name: string;
    recordType: TrainingMetrics["recordType"];
    muscleGroup: string | null;
    totals: TrainingProgressTotals;
  }[];
};
export type TrainingProgress = {
  activity: TrainingActivity[];
  exercises: TrainingExerciseProgress[];
};
const keyFor = (exerciseId: string, kind: TrainingMetrics["recordType"]) =>
  `${exerciseId}:${kind ?? "legacy"}`;
const round = (value: number) => Math.round(value * 100) / 100;
function sumTotals(values: TrainingProgressTotals[]): TrainingProgressTotals {
  const result = trainingTotals([]);
  for (const v of values)
    for (const key of Object.keys(result) as (keyof TrainingProgressTotals)[])
      result[key] += v[key];
  result.externalVolumeKg = round(result.externalVolumeKg);
  result.distanceMeters = round(result.distanceMeters);
  return result;
}
const improves = (metric: TrainingProgressMetric, value: number, before: number) =>
  metric === "assistanceKg" ? value < before - 1e-9 : value > before + 1e-9;
export function trainingProgressValues(m: TrainingMetrics) {
  const values: { metric: TrainingProgressMetric; value: number }[] = [];
  if (m.recordType === "assisted_bodyweight") {
    values.push({ metric: "reps", value: m.reps! }, { metric: "assistanceKg", value: m.weightKg! });
  } else {
    if (m.weightKg !== null) values.push({ metric: "weightKg", value: m.weightKg });
    if ((m.recordType === null || m.recordType === "weight_reps") && m.weightKg! > 0)
      values.push({ metric: "estimated1RM", value: estimated1RM(m.weightKg!, m.reps!) });
    if (m.reps !== null) values.push({ metric: "reps", value: m.reps });
  }
  if (m.durationSeconds !== null)
    values.push({ metric: "durationSeconds", value: m.durationSeconds });
  if (m.distanceMeters !== null) values.push({ metric: "distanceMeters", value: m.distanceMeters });
  return values;
}
function candidates(
  row: z.infer<typeof sourceSet>,
  workout: TrainingProgressSource["workouts"][number],
): TrainingProgressMark[] {
  return trainingProgressValues(row.metrics).map((v) => ({
    ...v,
    workoutId: workout.id,
    date: workout.date,
    setId: row.id,
    metrics: row.metrics,
  }));
}

function selectBest(values: TrainingProgressMark[], comparableAssistance = false) {
  const best = new Map<string, TrainingProgressMark>();
  for (const v of values) {
    const key =
      v.metric + (comparableAssistance && v.metric === "assistanceKg" ? `:${v.metrics.reps}` : "");
    const old = best.get(key);
    if (!old || improves(v.metric, v.value, old.value)) best.set(key, v);
  }
  return best;
}
/** Pure calculations from one validated snapshot. No catalog inference and no input mutation. */
export function buildTrainingProgress(input: TrainingProgressSource): TrainingProgress {
  const source = trainingProgressSourceSchema.parse(input),
    activity: TrainingActivity[] = [],
    exercises = new Map<string, TrainingExerciseProgress>();
  const ordered = [...source.workouts].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id),
  );
  const history = new Map<string, Map<string, TrainingProgressMark>>(),
    batch = new Map<string, TrainingProgressMark[]>();
  let batchInstant: number | null = null;
  const flushHistory = () => {
    for (const [key, marks] of batch) {
      const old = history.get(key) ?? new Map<string, TrainingProgressMark>();
      for (const [metric, m] of selectBest(marks, true)) {
        const prev = old.get(metric);
        if (!prev || improves(m.metric, m.value, prev.value)) old.set(metric, m);
      }
      history.set(key, old);
    }
    batch.clear();
  };
  for (const w of ordered) {
    const instant = Date.parse(w.startedAt);
    if (batchInstant !== null && instant !== batchInstant) flushHistory();
    batchInstant = instant;
    const byExercise = new Map<string, typeof w.sets>();
    for (const row of w.sets) {
      const key = keyFor(row.exerciseId, row.metrics.recordType);
      const group = byExercise.get(key) ?? [];
      group.push(row);
      byExercise.set(key, group);
    }
    const totals = (rows: typeof w.sets) =>
      trainingTotals(
        rows.map((r) =>
          trainingRecordedSetSchema.parse({ ...r.metrics, setType: r.setType, effort: r.effort }),
        ),
      );
    activity.push({
      id: w.id,
      startedAt: w.startedAt,
      date: w.date,
      sourceKind: w.sourceKind,
      title: w.title,
      sessionLabel: w.sessionLabel,
      durationSeconds: w.durationSeconds,
      perceivedEffort: w.perceivedEffort,
      note: w.note,
      totals: totals(w.sets),
      exercises: [...byExercise.values()].map((rows) => ({
        exerciseId: rows[0].exerciseId,
        name: rows[0].name,
        recordType: rows[0].metrics.recordType,
        muscleGroup: rows[0].muscleGroup,
        totals: totals(rows),
      })),
    });
    for (const [key, rows] of byExercise) {
      const working = rows
        .filter((r) => r.setType !== "warmup")
        .sort(
          (a, b) =>
            a.position - b.position || a.setNumber - b.setNumber || a.id.localeCompare(b.id),
        );
      if (!working.length) continue;
      const e = exercises.get(key) ?? {
        exerciseId: working[0].exerciseId,
        recordType: working[0].metrics.recordType,
        name: working[0].name,
        lastDate: w.date,
        workoutCount: 0,
        marks: [],
        points: [],
      };
      const allCandidates = working.flatMap((r) => candidates(r, w)),
        marks = [...selectBest(allCandidates).values()];
      const before = history.get(key) ?? new Map<string, TrainingProgressMark>();
      const records = [...selectBest(allCandidates, true).entries()].flatMap(([metricKey, m]) => {
        const old = before.get(metricKey);
        return old && improves(m.metric, m.value, old.value) ? [{ ...m, previous: old.value }] : [];
      });
      const pending = batch.get(key) ?? [];
      for (const mark of allCandidates) pending.push(mark);
      batch.set(key, pending);
      e.points.push({
        workoutId: w.id,
        date: w.date,
        startedAt: w.startedAt,
        totals: totals(working),
        marks,
        records,
      });
      e.name = working[0].name;
      e.lastDate = w.date;
      e.workoutCount++;
      e.marks = [...selectBest([...e.marks, ...marks]).values()];
      exercises.set(key, e);
    }
  }
  return {
    activity: activity.reverse(),
    exercises: [...exercises.values()].sort(
      (a, b) =>
        b.lastDate.localeCompare(a.lastDate) ||
        a.name.localeCompare(b.name, "es") ||
        keyFor(a.exerciseId, a.recordType).localeCompare(keyFor(b.exerciseId, b.recordType)),
    ),
  };
}
const totalsMetrics = [
  "workingSets",
  "externalVolumeKg",
  "bodyweightReps",
  "totalDurationSeconds",
  "totalDistanceMeters",
] as const;
export type TrainingComparisonMetric = TrainingProgressMetric | (typeof totalsMetrics)[number];
export function compareTrainingProgress(
  exercise: TrainingExerciseProgress,
  today: string,
  weeks: ProgressWeeks,
  metric: TrainingComparisonMetric,
) {
  z.iso.date().parse(today);
  const range = progressPeriods(today, weeks);
  const current = exercise.points.filter(
      (p) => p.date >= range.currentStart && p.date <= range.currentEnd,
    ),
    previous = exercise.points.filter(
      (p) => p.date >= range.previousStart && p.date <= range.previousEnd,
    );
  const totalKey =
    metric === "totalDurationSeconds"
      ? "durationSeconds"
      : metric === "totalDistanceMeters"
        ? "distanceMeters"
        : metric;
  const value = (points: TrainingProgressPoint[]) => {
    if (!points.length) return null;
    if (totalsMetrics.includes(metric as (typeof totalsMetrics)[number]))
      return round(
        points.reduce((sum, p) => sum + p.totals[totalKey as keyof TrainingProgressTotals], 0),
      );
    const marks = points.flatMap((p) => p.marks.filter((m) => m.metric === metric));
    if (!marks.length) return null;
    return (metric === "assistanceKg" ? Math.min : Math.max)(...marks.map((m) => m.value));
  };
  const currentValue = value(current),
    previousValue = value(previous);
  return {
    ...range,
    current,
    previous,
    currentValue,
    previousValue,
    direction: metric === "assistanceKg" ? ("lower" as const) : ("higher" as const),
    changePercent:
      currentValue !== null && previousValue !== null && previousValue !== 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : null,
  };
}
export function trainingPeriodSummary(
  activity: TrainingActivity[],
  today: string,
  from: string,
  to: string,
) {
  for (const d of [today, from, to]) z.iso.date().parse(d);
  if (from > to) throw Error("El periodo está invertido.");
  const observedEnd = to < today ? to : today,
    rows = activity.filter(
      (w) => w.date >= from && w.date <= observedEnd && w.totals.workingSets > 0,
    );
  const muscles = new Map<
    string | null,
    { muscleGroup: string | null; workingSets: number; volumeKg: number; workoutIds: string[] }
  >();
  for (const w of rows)
    for (const e of w.exercises) {
      if (!e.totals.workingSets) continue;
      const group = muscles.get(e.muscleGroup) ?? {
        muscleGroup: e.muscleGroup,
        workingSets: 0,
        volumeKg: 0,
        workoutIds: [],
      };
      group.workingSets += e.totals.workingSets;
      group.volumeKg = round(group.volumeKg + e.totals.externalVolumeKg);
      if (!group.workoutIds.includes(w.id)) group.workoutIds.push(w.id);
      muscles.set(e.muscleGroup, group);
    }
  return {
    from,
    to,
    observedEnd: observedEnd < from ? null : observedEnd,
    workoutCount: rows.length,
    activeDays: new Set(rows.map((w) => w.date)).size,
    activeWeeks: new Set(rows.map((w) => mondayOf(w.date))).size,
    observedWeeks:
      observedEnd < from ? 0 : daysBetween(mondayOf(from), mondayOf(observedEnd)) / 7 + 1,
    durationSeconds: rows.reduce((s, w) => s + w.durationSeconds, 0),
    totals: sumTotals(rows.map((w) => w.totals)),
    workoutIds: rows.map((w) => w.id),
    muscles: [...muscles.values()].sort(
      (a, b) =>
        b.workingSets - a.workingSets ||
        b.volumeKg - a.volumeKg ||
        (a.muscleGroup ?? "\uffff").localeCompare(b.muscleGroup ?? "\uffff", "es"),
    ),
  };
}
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => z.iso.date().safeParse(`${value}-01`).success);
export function trainingCalendar(month: string, activity: TrainingActivity[]) {
  monthSchema.parse(month);
  const first = `${month}-01`,
    next = month.endsWith("12")
      ? `${String(Number(month.slice(0, 4)) + 1).padStart(4, "0")}-01-01`
      : `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, "0")}-01`;
  z.iso.date().parse(next);
  const last = addDays(next, -1),
    end = addDays(mondayOf(last), 6),
    start = mondayOf(first);
  const grouped = new Map<string, TrainingActivity[]>();
  for (const w of activity) {
    const list = grouped.get(w.date) ?? [];
    list.push(w);
    grouped.set(w.date, list);
  }
  return {
    month,
    days: Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => {
      const date = addDays(start, i),
        rows = (grouped.get(date) ?? []).sort(
          (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id),
        );
      return {
        date,
        inMonth: date.startsWith(`${month}-`),
        workoutIds: rows.map((w) => w.id),
        workingSets: rows.reduce((sum, w) => sum + w.totals.workingSets, 0),
      };
    }),
  };
}
const filters = z
  .object({
    query: z.string().max(200).optional(),
    sourceKind: sourceKind.optional(),
    date: z.iso.date().optional(),
    month: monthSchema.optional(),
  })
  .strict();
export function filterTrainingActivity(
  activity: TrainingActivity[],
  input: z.infer<typeof filters>,
) {
  const f = filters.parse(input),
    normalize = (s: string) =>
      s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("es")
        .trim(),
    query = normalize(f.query ?? "");
  return activity.filter(
    (w) =>
      (!f.sourceKind || w.sourceKind === f.sourceKind) &&
      (!f.date || w.date === f.date) &&
      (!f.month || w.date.startsWith(`${f.month}-`)) &&
      (!query ||
        normalize(
          [w.title ?? "", w.sessionLabel ?? "", ...w.exercises.map((e) => e.name)].join(" "),
        ).includes(query)),
  );
}
