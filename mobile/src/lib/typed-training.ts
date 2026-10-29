import { z } from "zod";
import {
  athleteNoteSchema,
  trainingPrescriptionSchema,
  trainingRecordedSetSchema,
  trainingSetDetailsSchema,
  type TrainingPrescription,
  type TrainingRecordedSet,
} from "../../../src/domain/training-metrics";
import {
  parseTrainingSetInput,
  prefillTrainingInput,
  type TrainingInputField,
  type TrainingSetInput,
} from "../../../src/domain/training-input";
import { validRestSeconds } from "../../../src/domain/supersets";
import { finishedSupersetRound, nextSupersetSet } from "../../../src/domain/superset-rounds";
import { restAfterSet } from "../../../src/domain/rest-timer";
import { mobileRoutineSchema, type MobileRoutine } from "../../../src/lib/mobile/contracts";
import {
  typedRecordingPayloadSchema,
  type TypedRecordingPayload,
} from "../../../src/lib/mobile/typed-recording-contracts";
import {
  personalContextSchema,
  nativeWorkoutDraftSchema,
  type NativeWorkoutDraft,
  type PersonalTrainingContext,
} from "./personal-training";
import { buildTrainingRecording } from "./recording";

import {
  trainingChoiceSchema as choice,
  trainingContextIdentity as identity,
  validTrainingRows as validRows,
  typedContextSchema,
  type TypedTrainingContext,
} from "../../../src/lib/workout/training-context";
export {
  typedContextSchema,
  type TypedTrainingContext,
} from "../../../src/lib/workout/training-context";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const rest = z.number().int().nullable().refine(validRestSeconds);
const raw = z.string().max(100);
const draftSet = z
  .object({
    id: z.string().min(1).max(100),
    weight: raw,
    reps: raw,
    duration: raw,
    distance: raw,
    effort: raw,
    setType: trainingSetDetailsSchema.shape.setType,
    done: z.boolean(),
  })
  .strict();
const draftRow = choice
  .safeExtend({
    sessionExerciseId: uuid,
    restSeconds: rest,
    supersetId: uuid.nullable(),
    supersetRestSeconds: rest,
    skipped: z.boolean(),
    athleteNote: athleteNoteSchema,
    sets: z.array(draftSet).min(1).max(20),
  })
  .refine((r) => new Set(r.sets.map((s) => s.id)).size === r.sets.length);
export const typedDraftSchema = z
  .object({
    version: z.literal(4),
    ...identity,
    workoutId: uuid,
    userId: uuid,
    startedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    status: z.enum(["in_progress", "pending_save"]),
    finishedAt: z.iso.datetime({ offset: true }).optional(),
    perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
    note: athleteNoteSchema.optional(),
    durationSeconds: z.number().int().min(0).max(86400).optional(),
    rest: z
      .object({
        endsAt: z.number().int().nonnegative(),
        totalSeconds: z.number().int().min(15).max(600),
      })
      .strict()
      .nullable(),
    exercises: z.array(draftRow).max(15),
  })
  .strict()
  .refine((d) => validRows(d.exercises))
  .refine((d) => d.finishedAt === undefined || Date.parse(d.finishedAt) >= Date.parse(d.startedAt));
export type TypedTrainingDraft = z.infer<typeof typedDraftSchema>;
export type TypedDraftExercise = TypedTrainingDraft["exercises"][number];

/** Creation has no storage side effect. The controller protects this model before advertising it. */
export function createTypedDraft(input: {
  context: TypedTrainingContext;
  userId: string;
  workoutId: string;
  now: Date;
}): TypedTrainingDraft {
  const c = typedContextSchema.parse(input.context);
  if (c.version !== 3 && c.userId !== input.userId)
    throw Error("La rutina no corresponde a esta cuenta.");
  return typedDraftSchema.parse({
    version: 4,
    origin: c.origin,
    title: c.title,
    sessionLabel: c.sessionLabel,
    userId: input.userId,
    workoutId: input.workoutId,
    startedAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    status: "in_progress",
    rest: null,
    exercises: c.exercises.map(({ note: _note, alternatives: _alternatives, ...e }) => ({
      ...e,
      skipped: false,
      athleteNote: null,
      sets: Array.from({ length: e.prescribed.sets }, (_, i) => ({
        id: `${e.sessionExerciseId}-${i + 1}`,
        done: false,
        ...prefillTrainingInput(e.prescribed, i, e.lastMetrics, e.legacyLastWeightKg ?? null),
      })),
    })),
  });
}
export function typedSetTarget(exercise: TypedDraftExercise, setIndex: number) {
  const s = exercise.sets[setIndex];
  if (!s || s.setType === "warmup") return null;
  const workIndex = exercise.sets.slice(0, setIndex).filter((v) => v.setType !== "warmup").length;
  return exercise.prescribed.series
    ? (exercise.prescribed.series[workIndex] ?? null)
    : exercise.prescribed.target;
}
function mapSet(
  d: TypedTrainingDraft,
  ex: number,
  set: number,
  change: (s: z.infer<typeof draftSet>) => z.infer<typeof draftSet>,
): TypedTrainingDraft {
  if (d.status !== "in_progress")
    throw Error("Un cierre pendiente conserva sus valores originales.");
  if (!d.exercises[ex]?.sets[set]) return d;
  return {
    ...d,
    exercises: d.exercises.map((e, i) =>
      i !== ex ? e : { ...e, sets: e.sets.map((s, j) => (j !== set ? s : change(s))) },
    ),
  };
}
export function editTypedSet(
  d: TypedTrainingDraft,
  ex: number,
  set: number,
  field: TrainingInputField,
  value: string,
) {
  const kind = d.exercises[ex]?.prescribed.recordType;
  return mapSet(d, ex, set, (s) => {
    const next = { ...s, [field]: value };
    return { ...next, done: s.done && parseTrainingSetInput(kind ?? null, next) !== null };
  });
}
export function setTypedSetType(
  d: TypedTrainingDraft,
  ex: number,
  set: number,
  kind: TrainingSetInput["setType"],
) {
  trainingSetDetailsSchema.shape.setType.parse(kind);
  return mapSet(d, ex, set, (s) => ({
    ...s,
    setType: kind,
    done: (kind === "warmup") !== (s.setType === "warmup") ? false : s.done,
  }));
}
/** Historical results keep their own kind; a current catalog type never reinterprets them. */
export function previousTypedSet(
  exercise: TypedDraftExercise,
  setIndex: number,
  previous: TrainingRecordedSet[],
): TrainingRecordedSet | null {
  const current = exercise.sets[setIndex];
  if (!current) return null;
  const warm = current.setType === "warmup",
    ordinal = exercise.sets
      .slice(0, setIndex)
      .filter((s) => (s.setType === "warmup") === warm).length;
  const rows = z.array(trainingRecordedSetSchema).max(300).parse(previous);
  return (
    rows.filter(
      (s) => s.recordType === exercise.prescribed.recordType && (s.setType === "warmup") === warm,
    )[ordinal] ?? null
  );
}
/** Explicit copy updates only one unfinished set's metrics; classification and own effort remain. */
export function copyTypedSetPerformance(
  input: TypedTrainingDraft,
  ex: number,
  setIndex: number,
  previous: TrainingRecordedSet[],
): TypedTrainingDraft {
  const d = typedDraftSchema.parse(input),
    exercise = d.exercises[ex],
    current = exercise?.sets[setIndex];
  if (d.status !== "in_progress" || !current || exercise.skipped)
    throw Error("Retoma una serie pendiente antes de copiar valores.");
  if (current.done) return d;
  const match = previousTypedSet(exercise, setIndex, previous);
  if (!match) return d;
  const text = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
  return mapSet(d, ex, setIndex, (s) => ({
    ...s,
    weight: text(match.weightKg),
    reps: text(match.reps),
    duration: text(match.durationSeconds),
    distance: text(match.distanceMeters),
  }));
}
/** Copy metrics only, matched by warmup/work ordinal. Own effort and classification stay put. */
export function copyTypedPerformance(
  input: TypedTrainingDraft,
  ex: number,
  previous: TrainingRecordedSet[],
): TypedTrainingDraft {
  const d = typedDraftSchema.parse(input),
    e = d.exercises[ex];
  if (d.status !== "in_progress" || !e || e.skipped)
    throw Error("Retoma un ejercicio en curso antes de copiar valores.");
  const actual = z.array(trainingRecordedSetSchema).max(20).parse(previous);
  if (actual.some((s) => s.recordType !== e.prescribed.recordType))
    throw Error("Los valores anteriores corresponden a otro tipo de ejercicio.");
  const asText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
  let warm = 0,
    work = 0;
  const sets = e.sets.map((s) => {
    const warming = s.setType === "warmup",
      index = warming ? warm++ : work++;
    const match = actual.filter((v) => (v.setType === "warmup") === warming)[index];
    if (s.done || !match) return s;
    return {
      ...s,
      weight: asText(match.weightKg),
      reps: asText(match.reps),
      duration: asText(match.durationSeconds),
      distance: asText(match.distanceMeters),
    };
  });
  return { ...d, exercises: d.exercises.map((r, i) => (i === ex ? { ...r, sets } : r)) };
}
export function chooseTypedAlternative(
  context: TypedTrainingContext,
  input: TypedTrainingDraft,
  ex: number,
  exerciseId: string,
): TypedTrainingDraft {
  const c = typedContextSchema.parse(context),
    d = typedDraftSchema.parse(input);
  const source = c.exercises[ex],
    current = d.exercises[ex];
  if (
    c.origin.kind !== "assigned" ||
    JSON.stringify(c.origin) !== JSON.stringify(d.origin) ||
    d.status !== "in_progress" ||
    !source ||
    !current ||
    current.sessionExerciseId !== source.sessionExerciseId ||
    current.sets.some((s) => s.done)
  )
    throw Error("Elige una alternativa antes de completar series de ese ejercicio.");
  const selected = [source, ...source.alternatives].find(
    (r) => r.exerciseId === exerciseId.toLowerCase(),
  );
  if (!selected) throw Error("Esa alternativa no está autorizada en tu rutina.");
  if (selected.exerciseId === current.exerciseId) return d;
  const {
    exerciseId: id,
    name,
    isBodyweight,
    prescribed,
    lastMetrics,
    legacyLastWeightKg,
  } = selected;
  const next = {
    ...current,
    exerciseId: id,
    name,
    isBodyweight,
    prescribed,
    lastMetrics,
    legacyLastWeightKg: legacyLastWeightKg ?? null,
    sets: Array.from({ length: prescribed.sets }, (_, i) => ({
      id: `${current.sessionExerciseId}-${i + 1}`,
      done: false,
      ...prefillTrainingInput(prescribed, i, lastMetrics, legacyLastWeightKg ?? null),
    })),
  };
  return typedDraftSchema.parse({
    ...d,
    exercises: d.exercises.map((e, i) => (i === ex ? next : e)),
  });
}
const roundRows = (d: TypedTrainingDraft) =>
  d.exercises.map((e) => ({
    ...e,
    sets: e.sets.map((s) => ({ done: s.done, isWarmup: s.setType === "warmup" })),
  }));
export function completeTypedSet(
  input: TypedTrainingDraft,
  ex: number,
  set: number,
  now: Date,
  activeIndex: number,
) {
  const d = typedDraftSchema.parse(input),
    e = d.exercises[ex],
    s = e?.sets[set];
  if (d.status !== "in_progress" || !s || e.skipped)
    throw Error("Retoma una serie pendiente antes de registrarla.");
  if (!s.done && !parseTrainingSetInput(e.prescribed.recordType, s))
    throw Error("Revisa las métricas y el esfuerzo antes de marcar la serie.");
  let draft = mapSet(d, ex, set, (v) => ({ ...v, done: !v.done }));
  if (!s.done) {
    if (e.supersetId && s.setType !== "warmup") {
      const before = roundRows(d),
        after = roundRows(draft);
      const next = nextSupersetSet(after, e.supersetId);
      if (next) activeIndex = next.exerciseIndex;
      draft = {
        ...draft,
        rest: finishedSupersetRound(before, after, e.supersetId)
          ? restAfterSet(now.getTime(), false, e.supersetRestSeconds ?? 90)
          : null,
      };
    } else
      draft = {
        ...draft,
        rest: restAfterSet(
          now.getTime(),
          s.setType === "warmup",
          (e.supersetId ? e.supersetRestSeconds : e.restSeconds) ?? 90,
        ),
      };
  }
  return { draft: { ...draft, updatedAt: now.toISOString() }, activeIndex };
}
type RecordingResult =
  { ok: true; payload: TypedRecordingPayload } | { ok: false; reason: "invalid" | "no_sets" };
export function buildTypedRecording(
  context: TypedTrainingContext,
  input: TypedTrainingDraft,
  now: Date,
): RecordingResult {
  const invalid = { ok: false as const, reason: "invalid" as const };
  try {
    const c = typedContextSchema.parse(context),
      d = typedDraftSchema.parse(input);
    if (
      (c.version !== 3 && c.userId !== d.userId) ||
      JSON.stringify(c.origin) !== JSON.stringify(d.origin) ||
      c.title !== d.title ||
      c.sessionLabel !== d.sessionLabel ||
      c.exercises.length !== d.exercises.length
    )
      return invalid;
    const sets = [];
    for (const [i, e] of d.exercises.entries()) {
      const source = c.exercises[i];
      const authorized =
        source.exerciseId === e.exerciseId
          ? source
          : c.origin.kind === "assigned"
            ? source.alternatives.find((a) => a.exerciseId === e.exerciseId)
            : undefined;
      if (
        source.sessionExerciseId !== e.sessionExerciseId ||
        source.supersetId !== e.supersetId ||
        !authorized ||
        authorized.name !== e.name ||
        authorized.isBodyweight !== e.isBodyweight ||
        JSON.stringify(authorized.prescribed) !== JSON.stringify(e.prescribed)
      )
        return invalid;
      let setNumber = 0;
      for (const s of e.sets) {
        // Skipping an exercise does not grant permission to discard a corrupted completed set.
        if (!s.done) continue;
        const metrics = parseTrainingSetInput(e.prescribed.recordType, s);
        if (!metrics) return invalid;
        if (e.skipped) continue;
        const { setType, effort, ...values } = metrics;
        sets.push({
          exerciseId: e.exerciseId,
          position: i,
          setNumber: ++setNumber,
          metrics: values,
          setType,
          effort,
          ...(c.origin.kind === "assigned"
            ? {
                sessionExerciseId: source.sessionExerciseId,
                prescribedExerciseId: source.exerciseId,
                exerciseName: authorized.name,
              }
            : {}),
        });
      }
    }
    if (!sets.length) return { ok: false, reason: "no_sets" };
    const header = {
      version: 2,
      id: d.workoutId,
      startedAt: d.startedAt,
      finishedAt: d.finishedAt ?? now.toISOString(),
      durationSeconds:
        d.durationSeconds ??
        Math.max(0, Math.floor((now.getTime() - Date.parse(d.startedAt)) / 1000)),
      ...(d.perceivedEffort !== undefined ? { perceivedEffort: d.perceivedEffort } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
      exerciseNotes: d.exercises.map((e) => ({
        sessionExerciseId: e.sessionExerciseId,
        note: e.athleteNote,
      })),
      sets,
    };
    const payload = typedRecordingPayloadSchema.safeParse({
      version: 3,
      id: d.workoutId,
      source: c.origin.kind,
      workout:
        c.origin.kind === "assigned"
          ? {
              ...header,
              programId: c.origin.programId,
              programSessionId: c.origin.programSessionId,
              sessionLabel: c.sessionLabel,
            }
          : { ...header, origin: c.origin, title: c.title },
      structure: {
        version: 2,
        exercises: d.exercises.map((e, i) => {
          const source = c.exercises[i],
            rest = c.origin.kind === "assigned" ? source : e;
          return {
            id: e.sessionExerciseId,
            exerciseId: e.exerciseId,
            prescribedExerciseId: c.origin.kind === "assigned" ? source.exerciseId : null,
            prescribed: e.prescribed,
            note: source.note,
            restSeconds: rest.restSeconds,
            supersetId: source.supersetId,
            supersetRestSeconds: rest.supersetRestSeconds,
          };
        }),
      },
    });
    return payload.success ? { ok: true, payload: payload.data } : invalid;
  } catch {
    return invalid;
  }
}

/** Explicit bridge only for an in-progress legacy session. Never infer a modern record type. */
export function typedPrescriptionFromLegacy(
  p: MobileRoutine["exercises"][number]["prescribed"],
): TrainingPrescription {
  const target = (v: { repsMin: number; repsMax: number; targetWeightKg: number | null }) => ({
    ...v,
    targetDurationSeconds: null,
    targetDistanceMeters: null,
  });
  return trainingPrescriptionSchema.parse({
    recordType: null,
    sets: p.sets,
    target: target({ repsMin: p.repsMin, repsMax: p.repsMax, targetWeightKg: p.targetWeightKg }),
    series: p.series?.map(target) ?? null,
  });
}
export function upgradeLegacyTraining(
  context: MobileRoutine | PersonalTrainingContext,
  input: NativeWorkoutDraft,
): { context: TypedTrainingContext; draft: TypedTrainingDraft } {
  const c =
    context.version === 2
      ? personalContextSchema.parse(context)
      : mobileRoutineSchema.parse(context);
  const d = nativeWorkoutDraftSchema.parse(input);
  if (d.status !== "in_progress")
    throw Error("Un cierre pendiente conserva su formato y documento originales.");
  // Reuse the old builder's identity/source validation without changing any completed flags.
  const check = buildTrainingRecording(c, d, new Date(d.updatedAt));
  if (!check.ok && check.reason !== "no_sets")
    throw Error("El borrador no coincide con su rutina original.");
  const convertChoice = (
    e: Pick<
      MobileRoutine["exercises"][number],
      "exerciseId" | "name" | "isBodyweight" | "prescribed" | "lastWeightKg"
    >,
  ) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    isBodyweight: e.isBodyweight,
    prescribed: typedPrescriptionFromLegacy(e.prescribed),
    lastMetrics: null,
    legacyLastWeightKg: e.lastWeightKg ?? null,
  });
  const identityFields = {
    origin:
      c.version === 2
        ? c.origin
        : {
            kind: "assigned" as const,
            programId: c.session.programId,
            programSessionId: c.session.id,
          },
    title: c.session.title ?? null,
    sessionLabel: c.session.label,
  };
  const modern = typedContextSchema.parse({
    version: 3,
    ...identityFields,
    exercises: c.exercises.map((e) => ({
      ...convertChoice(e),
      sessionExerciseId: e.sessionExerciseId,
      note: e.note,
      restSeconds: e.restSeconds ?? null,
      supersetId: e.supersetId ?? null,
      supersetRestSeconds: e.supersetRestSeconds ?? null,
      alternatives: e.alternatives?.map(convertChoice) ?? [],
    })),
  });
  const draft = typedDraftSchema.parse({
    version: 4,
    ...identityFields,
    userId: d.userId,
    workoutId: d.workoutId,
    startedAt: d.startedAt,
    updatedAt: d.updatedAt,
    status: d.status,
    rest: d.rest ?? null,
    ...(d.perceivedEffort !== undefined ? { perceivedEffort: d.perceivedEffort } : {}),
    ...(d.note !== undefined ? { note: d.note } : {}),
    exercises: d.exercises.map((e) => ({
      sessionExerciseId: e.sessionExerciseId,
      exerciseId: e.exerciseId,
      name: e.name,
      isBodyweight: e.isBodyweight,
      prescribed: typedPrescriptionFromLegacy(e.prescribed),
      lastMetrics: null,
      restSeconds: e.restSeconds ?? null,
      supersetId: e.supersetId ?? null,
      supersetRestSeconds: e.supersetRestSeconds ?? null,
      skipped: e.skipped,
      athleteNote: null,
      sets: e.sets.map((s) => ({
        id: s.id,
        weight: s.weight,
        reps: s.reps,
        duration: "",
        distance: "",
        effort: "",
        setType: s.isWarmup ? "warmup" : "working",
        done: s.done,
      })),
    })),
  });
  return { context: modern, draft };
}
