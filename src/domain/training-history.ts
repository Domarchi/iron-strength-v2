import { z } from "zod";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingSetDetailsSchema,
} from "./training-metrics";
import { trainingProgressSourceSchema } from "./training-progress";
import { workoutStructureSchema } from "../lib/mobile/recording-contracts";
import {
  typedWorkoutStructureSchema,
  trainingExerciseNotesSchema,
} from "../lib/mobile/typed-recording-contracts";
import type { ExportSet } from "./csv";
const uuid = z.uuid(),
  name = z.string().min(1).max(100);
const sourceSet = z
  .object({
    id: uuid,
    exerciseId: uuid,
    name,
    prescribedExerciseId: uuid.nullable(),
    prescribedExerciseName: name.nullable(),
    muscleGroup: name.nullable(),
    position: z.number().int().nonnegative(),
    setNumber: z.number().int().positive(),
    metrics: trainingMetricsSchema,
    ...trainingSetDetailsSchema.shape,
  })
  .strict();
const workout = z
  .object({
    id: uuid,
    studentId: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }),
    date: z.iso.date(),
    durationSeconds: z.number().int().nonnegative(),
    sourceKind: z.enum(["assigned", "personal", "free"]),
    title: z.string().max(100).nullable(),
    personalRoutineId: uuid.nullable(),
    personalRoutineRevision: z.number().int().nonnegative().nullable(),
    programId: uuid.nullable(),
    programSessionId: uuid.nullable(),
    programName: z.string().nullable(),
    sessionLabel: z.string().nullable(),
    perceivedEffort: z.number().int().min(1).max(10).nullable(),
    note: athleteNoteSchema,
    editRevision: z.number().int().nonnegative(),
    structure: z.union([workoutStructureSchema, typedWorkoutStructureSchema]).nullable(),
    exerciseNotes: trainingExerciseNotesSchema.nullable(),
    exerciseNames: z.array(z.object({ id: uuid, name }).strict()).max(30),
    sets: z.array(sourceSet).max(100000),
  })
  .strict()
  .refine((w) => {
    if (Date.parse(w.finishedAt) < Date.parse(w.startedAt)) return false;
    const ids = new Set<string>(),
      slots = new Set<string>(),
      positions = new Map<number, string>();
    for (const s of w.sets) {
      const key = `${s.position}:${s.setNumber}`,
        identity = `${s.exerciseId}:${s.metrics.recordType ?? "legacy"}`;
      if (
        ids.has(s.id) ||
        slots.has(key) ||
        (positions.has(s.position) && positions.get(s.position) !== identity)
      )
        return false;
      ids.add(s.id);
      slots.add(key);
      positions.set(s.position, identity);
      if (w.structure) {
        const row = w.structure.exercises[s.position];
        if (!row || row.exerciseId !== s.exerciseId) return false;
        if (w.structure.version === 2) {
          const typed = w.structure.exercises[s.position];
          if (
            typed.prescribed.recordType !== s.metrics.recordType ||
            typed.prescribedExerciseId !== s.prescribedExerciseId
          )
            return false;
        }
      }
    }
    if (new Set(w.exerciseNames.map((e) => e.id)).size !== w.exerciseNames.length) return false;
    if (
      w.structure?.version === 2 &&
      (w.exerciseNotes === null ||
        w.exerciseNotes.length !== w.structure.exercises.length ||
        w.exerciseNotes.some((n, i) => n.sessionExerciseId !== w.structure?.exercises[i]?.id))
    )
      return false;
    return true;
  });
export const trainingHistorySourceSchema = z
  .object({
    version: z.literal(1),
    student: z.object({ id: uuid, name }).strict(),
    today: z.iso.date(),
    workouts: z.array(workout).max(10000),
  })
  .strict()
  .refine((value) => {
    const sets = value.workouts.flatMap((w) => w.sets);
    return (
      value.workouts.every((w) => w.studentId === value.student.id) &&
      new Set(value.workouts.map((w) => w.id)).size === value.workouts.length &&
      sets.length <= 100000 &&
      new Set(sets.map((s) => s.id)).size === sets.length
    );
  });
export type TrainingHistorySource = z.infer<typeof trainingHistorySourceSchema>;
/** Explicit projection; the closed own-progress contract remains version1 without extra fields. */
export function historyProgressSource(value: TrainingHistorySource) {
  return trainingProgressSourceSchema.parse({
    version: 1,
    userId: value.student.id,
    today: value.today,
    workouts: value.workouts.map((w) => ({
      id: w.id,
      startedAt: w.startedAt,
      date: w.date,
      sourceKind: w.sourceKind,
      title: w.title,
      sessionLabel: w.sessionLabel,
      durationSeconds: w.durationSeconds,
      perceivedEffort: w.perceivedEffort,
      note: w.note,
      sets: w.sets.map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        name: s.name,
        muscleGroup: s.muscleGroup,
        position: s.position,
        setNumber: s.setNumber,
        metrics: s.metrics,
        setType: s.setType,
        effort: s.effort,
      })),
    })),
  });
}
export function historyCsvRows(value: TrainingHistorySource): ExportSet[] {
  return value.workouts.flatMap((w) => {
    const names = new Map(w.exerciseNames.map((e) => [e.id, e.name])),
      notes = new Map((w.exerciseNotes ?? []).map((n) => [n.sessionExerciseId, n.note]));
    const common = {
      date: w.date,
      sessionLabel: w.sessionLabel,
      sourceKind: w.sourceKind,
      workoutTitle: w.title,
      perceivedEffort: w.perceivedEffort,
      workoutNote: w.note,
      workoutId: w.id,
    };
    const rows: { position: number; row: ExportSet }[] = w.sets.map((s) => ({
      position: s.position,
      row: {
        ...common,
        ...s.metrics,
        rowKind: "set",
        exerciseName: s.name,
        exerciseId: s.exerciseId,
        prescribedExerciseName: s.prescribedExerciseName,
        prescribedExerciseId: s.prescribedExerciseId,
        setNumber: s.setNumber,
        isWarmup: s.setType === "warmup",
        setType: s.setType,
        setEffort: s.effort,
        exerciseNote: notes.get(w.structure?.exercises[s.position]?.id ?? "") ?? null,
      },
    }));
    for (const [position, row] of (w.structure?.exercises ?? []).entries()) {
      const note = notes.get(row.id);
      if (note == null || w.sets.some((s) => s.position === position)) continue;
      rows.push({
        position,
        row: {
          ...common,
          rowKind: "exercise_note",
          exerciseName: names.get(row.exerciseId) ?? "Ejercicio no disponible",
          exerciseId: row.exerciseId,
          prescribedExerciseId: row.prescribedExerciseId,
          prescribedExerciseName: row.prescribedExerciseId
            ? (names.get(row.prescribedExerciseId) ?? null)
            : null,
          recordType:
            w.structure?.version === 2
              ? w.structure.exercises[position].prescribed.recordType
              : null,
          setNumber: null,
          isWarmup: false,
          weightKg: null,
          reps: null,
          durationSeconds: null,
          distanceMeters: null,
          setType: null,
          setEffort: null,
          exerciseNote: note,
        },
      });
    }
    return rows
      .sort((a, b) => a.position - b.position || (a.row.setNumber ?? 0) - (b.row.setNumber ?? 0))
      .map((item) => item.row);
  });
}
