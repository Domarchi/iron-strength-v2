import { z } from "zod";
import type { CurrentTraining, TypedActiveTraining } from "./training";
import { parseTrainingSetInput, type TrainingSetInput } from "../../../src/domain/training-input";
import type { NativeWorkoutDraft } from "./personal-training";
import type { TypedTrainingDraft } from "./typed-training";
import { formatTrainingMetrics, type RecordType } from "../../../src/domain/training-metrics";
const isTypedTraining = (a: CurrentTraining): a is TypedActiveTraining => a.draft.version === 4;
export function describeWarmup(kind: RecordType, input: TrainingSetInput) {
  const parsed = parseTrainingSetInput(kind, input);
  if (!parsed) throw Error("Revisa las métricas del calentamiento.");
  const { setType: _setType, effort: _effort, ...metrics } = parsed;
  return formatTrainingMetrics(metrics);
}

export type WarmupProposal = {
  userId: string;
  workoutId: string;
  rowId: string;
  exerciseId: string;
  requestId: string;
  expectedDraft: string;
  sets: TrainingSetInput[];
};
const inputSchema = z
  .object({
    weight: z.string().max(100),
    reps: z.string().max(100),
    duration: z.string().max(100),
    distance: z.string().max(100),
    effort: z.literal(""),
    setType: z.literal("warmup"),
  })
  .strict();
const proposalSchema = z
  .object({
    userId: z.uuid(),
    workoutId: z.uuid(),
    rowId: z.uuid(),
    exerciseId: z.uuid(),
    requestId: z.uuid(),
    expectedDraft: z.string(),
    sets: z.array(inputSchema).min(1).max(5),
  })
  .strict();
export function prepareWarmups(
  a: CurrentTraining,
  index: number,
  inputs: TrainingSetInput[],
  requestId: string,
): WarmupProposal {
  const e = a.draft.exercises[index];
  if (!e || a.draft.status !== "in_progress" || a.pause?.pausedAtMs != null || e.skipped)
    throw Error("Retoma el ejercicio antes de preparar calentamientos.");
  const sets = z.array(inputSchema).min(1).max(5).parse(inputs);
  if (
    e.sets.length + sets.length > 20 ||
    a.draft.exercises.reduce((n, r) => n + r.sets.length, 0) + sets.length > 300
  )
    throw Error(
      "No hay espacio para todas las series: máximo 20 por ejercicio y 300 por entrenamiento.",
    );
  const kind = isTypedTraining(a) ? a.draft.exercises[index].prescribed.recordType : null;
  if (sets.some((s) => !parseTrainingSetInput(kind, s)))
    throw Error("Revisa las métricas de cada calentamiento. No se añadieron series.");
  return proposalSchema.parse({
    userId: a.draft.userId,
    workoutId: a.draft.workoutId,
    rowId: e.sessionExerciseId,
    exerciseId: e.exerciseId,
    requestId,
    expectedDraft: JSON.stringify(a.draft),
    sets,
  });
}
export function applyWarmupProposal(
  a: CurrentTraining,
  raw: WarmupProposal,
  now: Date,
): CurrentTraining {
  const p = proposalSchema.parse(raw);
  if (
    a.draft.userId !== p.userId ||
    a.draft.workoutId !== p.workoutId ||
    a.draft.status !== "in_progress" ||
    a.pause?.pausedAtMs != null
  )
    throw Error("El entrenamiento cambió. Conservamos el registro; revisa nuevamente.");
  const index = a.draft.exercises.findIndex(
    (e) => e.sessionExerciseId === p.rowId && e.exerciseId === p.exerciseId,
  );
  if (index < 0) throw Error("El ejercicio cambió. Revisa nuevamente los calentamientos.");
  const row = a.draft.exercises[index];
  // Stable IDs make a retry after a local storage failure harmless.
  if (p.sets.every((_, i) => row.sets.some((s) => s.id === `${p.requestId}-${i}`))) return a;
  if (JSON.stringify(a.draft) !== p.expectedDraft)
    throw Error("El registro cambió desde la vista previa. Revisa nuevamente antes de añadir.");
  prepareWarmups(a, index, p.sets, p.requestId);
  const updatedAt = now.toISOString();
  if (isTypedTraining(a))
    return {
      ...a,
      draft: {
        ...a.draft,
        updatedAt,
        exercises: a.draft.exercises.map((e, i) =>
          i !== index
            ? e
            : {
                ...e,
                sets: [
                  ...p.sets.map((s, j) => ({ ...s, id: `${p.requestId}-${j}`, done: false })),
                  ...e.sets,
                ],
              },
        ),
      },
    };
  return {
    ...a,
    draft: {
      ...a.draft,
      updatedAt,
      exercises: a.draft.exercises.map((e, i) =>
        i !== index
          ? e
          : {
              ...e,
              sets: [
                ...p.sets.map((s, j) => ({
                  id: `${p.requestId}-${j}`,
                  weight: s.weight,
                  reps: s.reps,
                  isWarmup: true,
                  done: false,
                })),
                ...e.sets,
              ],
            },
      ),
    },
  };
}
export function applySessionRest<T extends NativeWorkoutDraft | TypedTrainingDraft>(
  draft: T,
  index: number,
  seconds: number,
): T {
  if (
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > 600 ||
    seconds % 15 ||
    draft.status !== "in_progress" ||
    !draft.exercises[index]
  )
    throw Error("Usa un descanso de 0 a 600 segundos, en pasos de 15.");
  const id = draft.exercises[index].supersetId;
  return {
    ...draft,
    exercises: draft.exercises.map((e, i) =>
      (id ? e.supersetId === id : i === index)
        ? { ...e, ...(id ? { supersetRestSeconds: seconds } : { restSeconds: seconds }) }
        : e,
    ),
  };
}
/** Capture only missing prescriptions on creation; recovery never re-applies a preference. */
export function captureRestPreference<T extends NativeWorkoutDraft | TypedTrainingDraft>(
  draft: T,
  seconds: number,
): T {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600 || seconds % 15)
    throw Error("Preferencia de descanso inválida.");
  if (seconds === 90) return draft;
  return {
    ...draft,
    exercises: draft.exercises.map((e) => ({
      ...e,
      restSeconds: e.restSeconds ?? seconds,
      ...(e.supersetId ? { supersetRestSeconds: e.supersetRestSeconds ?? seconds } : {}),
    })),
  };
}
