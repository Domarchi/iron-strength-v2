import { z } from "zod";
import { trainingSetDetailsSchema } from "../../domain/training-metrics";
import {
  workoutCorrectionSchema,
  workoutCorrectionSnapshotSchema,
  validateWorkoutCorrection,
  type WorkoutCorrectionSnapshot,
} from "../mobile/workout-correction-contracts";
const raw = z.string().max(30),
  note = z.string().max(4000);
const setFormSchema = z
  .object({
    id: z.uuid(),
    weightKg: raw,
    reps: raw,
    durationSeconds: raw,
    distanceMeters: raw,
    setType: trainingSetDetailsSchema.shape.setType.nullable(),
    effort: raw,
    isWarmup: z.boolean(),
    removed: z.boolean(),
  })
  .strict();
export const workoutCorrectionFormSchema = z
  .object({
    perceivedEffort: raw,
    note,
    exerciseNotes: z
      .array(z.object({ sessionExerciseId: z.uuid(), note }).strict())
      .max(15)
      .nullable(),
    sets: z.array(setFormSchema).min(1).max(300),
  })
  .strict();
export type WorkoutCorrectionForm = z.infer<typeof workoutCorrectionFormSchema>;
type SetForm = z.infer<typeof setFormSchema>;
const text = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const blank = (value: string) => (value === "" ? null : value);
export function correctionFormFromSnapshot(
  value: WorkoutCorrectionSnapshot,
): WorkoutCorrectionForm {
  const w = workoutCorrectionSnapshotSchema.parse(value).workout;
  return {
    perceivedEffort: text(w.perceivedEffort),
    note: w.note ?? "",
    exerciseNotes: w.exerciseNotes?.map((r) => ({ ...r, note: r.note ?? "" })) ?? null,
    sets: w.sets.map((s) => ({
      id: s.id,
      weightKg: text(s.metrics.weightKg),
      reps: text(s.metrics.reps),
      durationSeconds: text(s.metrics.durationSeconds),
      distanceMeters: text(s.metrics.distanceMeters),
      setType: s.setType,
      effort: text(s.effort),
      isWarmup: s.isWarmup,
      removed: false,
    })),
  };
}
/** Roster/format checks preserve partial numeric text; submission validates the values. */
export function validateCorrectionForm(
  snapshot: WorkoutCorrectionSnapshot,
  value: unknown,
): WorkoutCorrectionForm {
  const w = workoutCorrectionSnapshotSchema.parse(snapshot).workout,
    form = workoutCorrectionFormSchema.parse(value),
    typed = w.structure?.version === 2;
  if (form.sets.length !== w.sets.length || form.sets.some((s, i) => s.id !== w.sets[i].id))
    throw Error("La propuesta no corresponde a las series originales.");
  for (const s of form.sets) {
    if (
      typed
        ? s.setType === null || s.isWarmup !== (s.setType === "warmup")
        : s.setType !== null || s.effort !== ""
    )
      throw Error("Conserva el formato de clases y esfuerzo del resultado original.");
  }
  if (
    w.exerciseNotes === null
      ? form.exerciseNotes !== null
      : !form.exerciseNotes ||
        form.exerciseNotes.length !== w.exerciseNotes.length ||
        form.exerciseNotes.some(
          (r, i) => r.sessionExerciseId !== w.exerciseNotes![i].sessionExerciseId,
        )
  )
    throw Error("Las notas no corresponden a las filas originales.");
  return form;
}
function numeric(value: string, integer = false): number {
  const trimmed = value.trim();
  const pattern = integer ? /^\d+$/ : /^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/;
  if (!pattern.test(trimmed))
    throw Error(
      "Completa los valores numéricos; usa hasta dos decimales y sin separador de miles.",
    );
  return Number(trimmed.replace(",", "."));
}
function dimension(value: string, existing: number | null, integer = false) {
  if (existing === null) {
    if (value !== "") throw Error("Este tipo de ejercicio no admite esa dimensión.");
    return null;
  }
  return numeric(value, integer);
}
export function correctionFromForm(
  snapshot: WorkoutCorrectionSnapshot,
  value: WorkoutCorrectionForm,
  requestId: string,
) {
  const base = workoutCorrectionSnapshotSchema.parse(snapshot),
    form = validateCorrectionForm(base, value);
  const input = workoutCorrectionSchema.parse({
    version: 1,
    requestId,
    workoutId: base.workout.id,
    expectedRevision: base.workout.revision,
    perceivedEffort:
      form.perceivedEffort.trim() === "" ? null : numeric(form.perceivedEffort, true),
    note: blank(form.note),
    exerciseNotes: form.exerciseNotes?.map((r) => ({ ...r, note: blank(r.note) })) ?? null,
    sets: form.sets.flatMap((s, i) => {
      if (s.removed) return [];
      const original = base.workout.sets[i].metrics;
      return [
        {
          id: s.id,
          metrics: {
            recordType: original.recordType,
            weightKg: dimension(s.weightKg, original.weightKg),
            reps: dimension(s.reps, original.reps, true),
            durationSeconds: dimension(s.durationSeconds, original.durationSeconds, true),
            distanceMeters: dimension(s.distanceMeters, original.distanceMeters),
          },
          setType: s.setType,
          effort: s.effort.trim() === "" ? null : numeric(s.effort),
          isWarmup: s.isWarmup,
        },
      ];
    }),
  });
  return validateWorkoutCorrection(base, input);
}
const fields = [
  "weightKg",
  "reps",
  "durationSeconds",
  "distanceMeters",
  "setType",
  "effort",
  "isWarmup",
  "removed",
] as const;
const changedSet = (a: SetForm, b: SetForm) => fields.some((key) => a[key] !== b[key]);
/** Preparation only: callers must show the comparison and explicitly accept unapplied edits. */
export function mergeCorrectionForm(
  baseValue: WorkoutCorrectionSnapshot,
  localValue: WorkoutCorrectionForm,
  latestValue: WorkoutCorrectionSnapshot,
) {
  const base = workoutCorrectionSnapshotSchema.parse(baseValue),
    latest = workoutCorrectionSnapshotSchema.parse(latestValue),
    local = validateCorrectionForm(base, localValue);
  if (
    base.userId !== latest.userId ||
    base.workout.id !== latest.workout.id ||
    latest.workout.revision < base.workout.revision ||
    base.workout.sourceKind !== latest.workout.sourceKind ||
    base.workout.structure?.version !== latest.workout.structure?.version
  )
    throw Error("La versión actual no se puede combinar con esta propuesta.");
  const original = correctionFormFromSnapshot(base),
    current = correctionFormFromSnapshot(latest);
  const originalById = new Map(
    original.sets.map((s, i) => [
      s.id,
      { form: s, row: base.workout.sets[i], local: local.sets[i] },
    ]),
  );
  const latestIds = new Set(current.sets.map((s) => s.id));
  const unapplied = original.sets.flatMap((s, i) =>
    !latestIds.has(s.id) && !local.sets[i].removed && changedSet(s, local.sets[i])
      ? [
          {
            id: s.id,
            exerciseName: base.workout.sets[i].exerciseName,
            setNumber: base.workout.sets[i].setNumber,
            values: { ...local.sets[i] },
          },
        ]
      : [],
  );
  const form: WorkoutCorrectionForm = {
    note: local.note !== original.note ? local.note : current.note,
    perceivedEffort:
      local.perceivedEffort !== original.perceivedEffort
        ? local.perceivedEffort
        : current.perceivedEffort,
    exerciseNotes:
      current.exerciseNotes?.map((r) => {
        const old = original.exerciseNotes?.find(
            (n) => n.sessionExerciseId === r.sessionExerciseId,
          ),
          changed = local.exerciseNotes?.find((n) => n.sessionExerciseId === r.sessionExerciseId);
        return old && changed && old.note !== changed.note ? { ...r, note: changed.note } : r;
      }) ?? null,
    sets: current.sets.map((s, i) => {
      const prior = originalById.get(s.id),
        row = latest.workout.sets[i];
      if (!prior) return s;
      if (
        prior.row.exerciseId !== row.exerciseId ||
        prior.row.position !== row.position ||
        prior.row.setNumber !== row.setNumber ||
        prior.row.metrics.recordType !== row.metrics.recordType
      )
        throw Error(
          "Cambió la identidad o el tipo de una serie; conserva la propuesta para revisarla.",
        );
      return setFormSchema.parse({
        ...s,
        ...Object.fromEntries(
          fields
            .filter((key) => prior.local[key] !== prior.form[key])
            .map((key) => [key, prior.local[key]]),
        ),
      });
    }),
  };
  return { form: validateCorrectionForm(latest, form), unapplied };
}
