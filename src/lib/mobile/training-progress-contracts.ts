import { z } from "zod";
import { TRAINING_PROGRESS_METRICS, trainingProgressValues } from "../../domain/training-progress";
import {
  athleteNoteSchema,
  recordTypeSchema,
  trainingMetricsSchema,
} from "../../domain/training-metrics";
const uuid = z.uuid(),
  date = z.iso.date(),
  amount = z.number().nonnegative();
const totals = z
  .object({
    workingSets: amount.int(),
    externalVolumeKg: amount,
    bodyweightReps: amount.int(),
    durationSeconds: amount.int(),
    distanceMeters: amount,
  })
  .strict();
const markBase = z
  .object({
    metric: z.enum(TRAINING_PROGRESS_METRICS),
    value: amount,
    workoutId: uuid,
    date,
    setId: uuid,
    metrics: trainingMetricsSchema,
  })
  .strict();
const markMatches = (m: z.infer<typeof markBase>) =>
  trainingProgressValues(m.metrics).some((v) => v.metric === m.metric && v.value === m.value);
const mark = markBase.refine(markMatches);
const record = markBase
  .extend({ previous: amount })
  .strict()
  .refine(
    (m) =>
      markMatches(m) &&
      (m.metric === "assistanceKg" ? m.value < m.previous - 1e-9 : m.value > m.previous + 1e-9),
  );
const point = z
  .object({
    workoutId: uuid,
    date,
    startedAt: z.iso.datetime({ offset: true }),
    totals,
    marks: z.array(mark).max(6),
    records: z.array(record).max(100000),
  })
  .strict();
const exercise = z
  .object({
    exerciseId: uuid,
    recordType: recordTypeSchema,
    name: z.string().min(1).max(100),
    lastDate: date,
    workoutCount: amount.int().positive(),
    marks: z.array(mark).max(6),
    points: z.array(point).min(1).max(10000),
  })
  .strict()
  .refine(
    (e) =>
      e.workoutCount === e.points.length &&
      new Set(e.points.map((p) => p.workoutId)).size === e.points.length &&
      [...e.marks, ...e.points.flatMap((p) => [...p.marks, ...p.records])].every(
        (m) => m.metrics.recordType === e.recordType,
      ),
  );
const activity = z
  .object({
    id: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    date,
    sourceKind: z.enum(["assigned", "personal", "free"]),
    title: z.string().max(100).nullable(),
    sessionLabel: z.string().max(100).nullable(),
    durationSeconds: amount.int().max(86400),
    perceivedEffort: z.number().int().min(1).max(10).nullable(),
    note: athleteNoteSchema,
    totals,
    exercises: z
      .array(
        z
          .object({
            exerciseId: uuid,
            name: z.string().min(1).max(100),
            recordType: recordTypeSchema,
            muscleGroup: z.string().min(1).max(100).nullable(),
            totals,
          })
          .strict(),
      )
      .max(100000),
  })
  .strict()
  .refine((w) => {
    if (
      new Set(w.exercises.map((e) => `${e.exerciseId}:${e.recordType ?? "legacy"}`)).size !==
      w.exercises.length
    )
      return false;
    return (Object.keys(w.totals) as (keyof typeof w.totals)[]).every(
      (key) =>
        Math.round(w.exercises.reduce((sum, e) => sum + e.totals[key], 0) * 100) / 100 ===
        w.totals[key],
    );
  });
export const trainingProgressSchema = z
  .object({
    version: z.literal(2),
    userId: uuid,
    today: date,
    activity: z.array(activity).max(10000),
    exercises: z.array(exercise).max(100000),
  })
  .strict()
  .refine((value) => {
    const activities = new Map(value.activity.map((w) => [w.id, w]));
    if (
      activities.size !== value.activity.length ||
      new Set(value.exercises.map((e) => `${e.exerciseId}:${e.recordType ?? "legacy"}`)).size !==
        value.exercises.length
    )
      return false;
    return value.exercises.every(
      (e) =>
        e.points.every((p) => {
          const w = activities.get(p.workoutId);
          return (
            !!w &&
            w.date === p.date &&
            w.startedAt === p.startedAt &&
            w.exercises.some(
              (r) =>
                r.exerciseId === e.exerciseId &&
                r.recordType === e.recordType &&
                (Object.keys(r.totals) as (keyof typeof r.totals)[]).every(
                  (key) => r.totals[key] === p.totals[key],
                ),
            ) &&
            [...p.marks, ...p.records].every(
              (m) => m.workoutId === p.workoutId && m.date === p.date,
            )
          );
        }) &&
        e.marks.every((m) =>
          e.points.some(
            (p) =>
              p.workoutId === m.workoutId &&
              p.date === m.date &&
              p.marks.some(
                (pm) => pm.setId === m.setId && pm.metric === m.metric && pm.value === m.value,
              ),
          ),
        ),
    );
  });
export type MobileTrainingProgress = z.infer<typeof trainingProgressSchema>;
