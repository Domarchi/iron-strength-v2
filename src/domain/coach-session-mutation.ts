import { z } from "zod";
import { prescriptionInputFields } from "./prescription-input";
import {
  athleteNoteSchema,
  trainingPrescriptionSchema,
  trainingTargetSchema,
  trainingTargetSummary,
  type TrainingPrescription,
  type TrainingTarget,
} from "./training-metrics";

const uuid = z.uuid();
const revision = z.number().int().min(0).max(2147483647);
const rest = z.union([z.literal(0), z.number().int().min(15).max(600)]).nullable();
const targetKeys = [
  "repsMin",
  "repsMax",
  "targetWeightKg",
  "targetDurationSeconds",
  "targetDistanceMeters",
] as const;
const scalarKeys = ["sets", ...targetKeys] as const;
const unique = (values: string[]) =>
  new Set(values.map((value) => value.toLowerCase())).size === values.length;
export const coachPrescriptionChangesSchema = z
  .object({
    prescribed: trainingPrescriptionSchema.optional(),
    sets: z.number().int().min(1).max(10).optional(),
    repsMin: trainingTargetSchema.shape.repsMin.unwrap().optional(),
    repsMax: trainingTargetSchema.shape.repsMax.unwrap().optional(),
    targetWeightKg: trainingTargetSchema.shape.targetWeightKg.optional(),
    targetDurationSeconds: trainingTargetSchema.shape.targetDurationSeconds.optional(),
    targetDistanceMeters: trainingTargetSchema.shape.targetDistanceMeters.optional(),
    note: athleteNoteSchema.optional(),
    restSeconds: rest.optional(),
    supersetRestSeconds: rest.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).length > 0 &&
      Object.values(value).every((field) => field !== undefined) &&
      !(value.prescribed !== undefined && scalarKeys.some((key) => Object.hasOwn(value, key))),
    "Elige cambios explícitos y una sola forma de objetivo.",
  );
export type CoachPrescriptionChanges = z.infer<typeof coachPrescriptionChangesSchema>;
const items = z
  .array(z.object({ id: uuid, exerciseId: uuid }).strict())
  .min(1)
  .max(15)
  .refine((rows) => unique(rows.map((row) => row.id)) && unique(rows.map((row) => row.exerciseId)));
const patches = z
  .array(z.object({ id: uuid, exerciseId: uuid, changes: coachPrescriptionChangesSchema }).strict())
  .max(15)
  .refine((rows) => unique(rows.map((row) => row.id)));
const alternative = z.object({ exerciseId: uuid, prescribed: trainingPrescriptionSchema }).strict();
const layoutRow = z
  .object({ id: uuid, restSeconds: rest, supersetId: uuid.nullable(), supersetRestSeconds: rest })
  .strict();
function validLayout(rows: z.infer<typeof layoutRow>[]): boolean {
  if (!unique(rows.map((row) => row.id))) return false;
  const groups = new Map<string, { index: number; rest: number | null }[]>();
  for (const [index, row] of rows.entries()) {
    if (row.supersetId === null) {
      if (row.supersetRestSeconds !== null) return false;
      continue;
    }
    const key = row.supersetId.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), { index, rest: row.supersetRestSeconds }]);
  }
  return [...groups.values()].every(
    (group) =>
      group.length >= 2 &&
      group.length <= 4 &&
      group.at(-1)!.index - group[0].index + 1 === group.length &&
      group.every((row) => row.rest === group[0].rest),
  );
}
const header = { version: z.literal(2), id: uuid, revision };
function operation<K extends string, S extends z.ZodType>(kind: K, data: S) {
  return z.object({ ...header, operation: z.literal(kind), data }).strict();
}
export const coachSessionRequestSchema = z.discriminatedUnion("operation", [
  operation("add", z.object({ items }).strict()),
  operation(
    "prescribe",
    z
      .object({
        rows: patches,
        title: z.string().max(80).optional(),
        weekday: z.number().int().min(-1).max(6).optional(),
      })
      .strict()
      .refine(
        (data) =>
          (data.rows.length > 0 || data.title !== undefined || data.weekday !== undefined) &&
          Object.values(data).every((value) => value !== undefined),
      ),
  ),
  operation(
    "alternatives",
    z
      .object({
        rowId: uuid,
        alternatives: z
          .array(alternative)
          .max(3)
          .refine((rows) => unique(rows.map((row) => row.exerciseId))),
      })
      .strict(),
  ),
  operation("order", z.object({ ids: z.array(uuid).min(1).max(15).refine(unique) }).strict()),
  operation(
    "layout",
    z.object({ items: z.array(layoutRow).min(1).max(15).refine(validLayout) }).strict(),
  ),
  operation("remove", z.object({ rowId: uuid }).strict()),
  operation("duplicate", z.object({ copyId: uuid, rowId: uuid.nullable() }).strict()),
]);
export type CoachSessionRequest = z.infer<typeof coachSessionRequestSchema>;
export const coachSessionResultSchema = z
  .object({
    version: z.literal(2),
    id: uuid,
    sessionId: uuid,
    revision,
    status: z.enum(["applied", "duplicate", "removed"]),
    copyId: uuid.optional(),
    copyKind: z.enum(["exercise", "session"]).optional(),
  })
  .strict()
  .refine((value) => (value.copyId === undefined) === (value.copyKind === undefined));
export type CoachSessionResult = z.infer<typeof coachSessionResultSchema>;

/** Selected dimensions update every target, preserving the other per-set values. */
export function applyCoachPrescriptionChanges(
  current: TrainingPrescription,
  input: unknown,
): TrainingPrescription {
  const source = trainingPrescriptionSchema.parse(current);
  const changes = coachPrescriptionChangesSchema.parse(input);
  if (changes.prescribed !== undefined) {
    if (changes.prescribed.recordType !== source.recordType)
      throw new Error("El tipo del ejercicio no se puede cambiar.");
    return changes.prescribed;
  }
  const allowed = prescriptionInputFields(source.recordType);
  const chosen = targetKeys.filter((key) => Object.hasOwn(changes, key));
  if (chosen.some((key) => !allowed.includes(key)))
    throw new Error("Una dimensión elegida no corresponde al ejercicio.");
  const patch = Object.fromEntries(chosen.map((key) => [key, changes[key]]));
  const changeTarget = (target: TrainingTarget) =>
    trainingTargetSchema.parse({ ...target, ...patch });
  const sets = changes.sets ?? source.sets;
  const original = source.series;
  const series =
    original === null
      ? null
      : Array.from({ length: sets }, (_, index) =>
          changeTarget(original[Math.min(index, original.length - 1)]),
        );
  return trainingPrescriptionSchema.parse({
    ...source,
    sets,
    series,
    target: series === null ? changeTarget(source.target) : trainingTargetSummary(series),
  });
}
