import { z } from "zod";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingRecordedSetSchema,
  recordTypeSchema,
} from "../../domain/training-metrics";
import { validRestSeconds, validSupersetLayout } from "../../domain/supersets";
import { addDays, isMonday } from "../../domain/dates";
import { programWeekNumber } from "../../domain/program-weeks";
import { LIMITS } from "../../domain/limits";
import { personalWorkoutOriginSchema } from "../mobile/personal-workout-contracts";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const rest = z.number().int().nullable().refine(validRestSeconds);
const origin = z.union([
  personalWorkoutOriginSchema,
  z.object({ kind: z.literal("assigned"), programId: uuid, programSessionId: uuid }).strict(),
]);
export const trainingChoiceSchema = z
  .object({
    exerciseId: uuid,
    name: z.string().min(1).max(100),
    isBodyweight: z.boolean(),
    prescribed: trainingPrescriptionSchema,
    lastMetrics: trainingMetricsSchema.nullable(),
    legacyLastWeightKg: z.number().min(0).max(500).nullable().optional(),
  })
  .strict()
  .refine((r) => r.lastMetrics === null || r.lastMetrics.recordType === r.prescribed.recordType)
  .refine((r) => r.legacyLastWeightKg == null || r.prescribed.recordType === null);
const row = trainingChoiceSchema
  .safeExtend({
    sessionExerciseId: uuid,
    note: athleteNoteSchema,
    restSeconds: rest,
    supersetId: uuid.nullable(),
    supersetRestSeconds: rest,
    alternatives: z.array(trainingChoiceSchema).max(3),
  })
  .refine(
    (r) =>
      new Set([r.exerciseId, ...r.alternatives.map((c) => c.exerciseId)]).size ===
      r.alternatives.length + 1,
  );
export const validTrainingRows = (
  rows: {
    sessionExerciseId: string;
    name: string;
    supersetId: string | null;
    supersetRestSeconds: number | null;
  }[],
) => validSupersetLayout(rows.map((r) => ({ ...r, id: r.sessionExerciseId })));
export const trainingContextIdentity = {
  origin,
  title: z.string().trim().min(1).max(100).nullable(),
  sessionLabel: z.string().min(1).max(10),
};
export const previousTypedContextSchema = z
  .object({ version: z.literal(3), ...trainingContextIdentity, exercises: z.array(row).max(15) })
  .strict()
  .refine((c) => validTrainingRows(c.exercises))
  .refine(
    (c) =>
      c.origin.kind === "assigned" ||
      (c.title !== null &&
        c.sessionLabel === (c.origin.kind === "personal" ? "Personal" : "Libre")),
  )
  .refine((c) => c.origin.kind === "assigned" || c.exercises.every((e) => !e.alternatives.length));

const assignedOrigin = z
  .object({ kind: z.literal("assigned"), programId: uuid, programSessionId: uuid })
  .strict();
export const assignedContextSchema = z
  .object({
    version: z.literal(5),
    userId: uuid,
    previousSets: z
      .array(
        z
          .object({
            exerciseId: uuid,
            recordType: recordTypeSchema,
            sets: z.array(trainingRecordedSetSchema).min(1).max(300),
          })
          .strict()
          .refine((r) => r.sets.every((s) => s.recordType === r.recordType)),
      )
      .max(60),
    ...trainingContextIdentity,
    origin: assignedOrigin,
    exercises: z.array(row).max(15),
    session: z
      .object({
        id: uuid,
        label: z.string().regex(/^[A-G]$/),
        title: z.string().min(1).max(100).nullable(),
        programId: uuid,
        programName: z.string().min(1).max(100),
        weekNumber: z.number().int().min(1).max(LIMITS.weeksMax),
        weeksCount: z.number().int().min(LIMITS.weeksMin).max(LIMITS.weeksMax),
        revision: z.number().int().nonnegative().safe(),
        startDate: z.iso.date(),
        endsOn: z.iso.date(),
      })
      .strict(),
  })
  .strict()
  .refine((c) => validTrainingRows(c.exercises))
  .refine((c) => {
    const wanted = new Set(
        c.exercises
          .flatMap((r) => [r, ...r.alternatives])
          .map((r) => JSON.stringify([r.exerciseId, r.prescribed.recordType])),
      ),
      keys = c.previousSets.map((r) => JSON.stringify([r.exerciseId, r.recordType]));
    return new Set(keys).size === keys.length && keys.every((key) => wanted.has(key));
  })
  .refine((c) => {
    const s = c.session;
    return (
      c.origin.programId === s.programId &&
      c.origin.programSessionId === s.id &&
      c.sessionLabel === s.label &&
      c.title === s.title &&
      s.weekNumber <= s.weeksCount &&
      isMonday(s.startDate) &&
      s.endsOn >= s.startDate &&
      s.endsOn <= addDays(s.startDate, s.weeksCount * 7 - 1)
    );
  });
export type AssignedTrainingContext = z.infer<typeof assignedContextSchema>;
export const previousAssignedContextSchema = z
  .object({ ...assignedContextSchema.shape, version: z.literal(4) })
  .omit({ previousSets: true })
  .strict()
  .refine((c) => assignedContextSchema.safeParse({ ...c, version: 5, previousSets: [] }).success);
export type RecoverableAssignedContext =
  AssignedTrainingContext | z.infer<typeof previousAssignedContextSchema>;
export const typedContextSchema = z.union([
  previousTypedContextSchema,
  previousAssignedContextSchema,
  assignedContextSchema,
]);
export type TypedTrainingContext = z.infer<typeof typedContextSchema>;
/** For a new start only. Recovery never replaces the stored context with a current snapshot. */
export function assignedCanStart(
  c: RecoverableAssignedContext,
  userId: string,
  today: string,
): boolean {
  return (
    c.userId === userId &&
    z.iso.date().safeParse(today).success &&
    programWeekNumber(
      {
        startDate: c.session.startDate,
        endsOn: c.session.endsOn,
        weeksCount: c.session.weeksCount,
      },
      today,
    ) === c.session.weekNumber
  );
}
