// Lógica pura de la sesión en curso (RF-20 a RF-24, RF-26; DC-6, DC-9). Funciones inmutables sobre
// el borrador: la interfaz solo las llama y persiste el resultado. Los números se guardan como
// texto mientras el alumno escribe y se convierten (con los límites de la spec) al finalizar.
import { seriesTargetAt, isUniformPrescription } from "../../domain/prescription-series";
import { workoutSetSchema } from "../../domain/schemas.ts";
import { prefillWeight, type LastSet } from "../../domain/progression.ts";
import { setVolume } from "../../domain/volume.ts";
import { MAX_REST_SECONDS, MIN_REST_SECONDS } from "../../domain/rest-timer.ts";
import type { DraftExercise, DraftSet, WorkoutDraft } from "./draft.ts";

export type PrefillChoice = {
  exerciseId: string;
  name: string;
  isBodyweight: boolean;
  prescribed: DraftExercise["prescribed"];
  lastWeightKg: number | null;
};

export type PrefillExercise = PrefillChoice & {
  sessionExerciseId: string;
  alternatives?: PrefillChoice[];
  restSeconds?: number | null;
  supersetId?: string | null;
  supersetRestSeconds?: number | null;
};

const asText = (kg: number | null) => (kg === null ? "" : String(kg).replace(".", ","));

// Common record fields keep assigned IDs outside the pure set/rond logic.
export type RunnerDraft = Omit<WorkoutDraft, "version" | "programId" | "plannedSessionId">;
const clonePrescription = (p: DraftExercise["prescribed"]): DraftExercise["prescribed"] => ({
  ...p,
  ...(p.series ? { series: p.series.map((target) => ({ ...target })) } : {}),
});
export function prefillDraftExercises(exercises: PrefillExercise[]): DraftExercise[] {
  return exercises.map((e) => ({
    sessionExerciseId: e.sessionExerciseId,
    exerciseId: e.exerciseId,
    name: e.name,
    isBodyweight: e.isBodyweight,
    prescribed: clonePrescription(e.prescribed),
    skipped: false,
    ...(e.alternatives?.length
      ? {
          original: {
            exerciseId: e.exerciseId,
            name: e.name,
            isBodyweight: e.isBodyweight,
            prescribed: clonePrescription(e.prescribed),
            lastWeightKg: e.lastWeightKg,
          },
          alternatives: e.alternatives.map((choice) => ({
            ...choice,
            prescribed: clonePrescription(choice.prescribed),
          })),
        }
      : {}),
    ...(e.restSeconds != null ? { restSeconds: e.restSeconds } : {}),
    ...(e.supersetId ? { supersetId: e.supersetId } : {}),
    ...(e.supersetRestSeconds != null ? { supersetRestSeconds: e.supersetRestSeconds } : {}),
    sets: Array.from({ length: e.prescribed.sets }, (_, i) => ({
      id: `${e.sessionExerciseId}-${i + 1}`,
      weight: asText(
        prefillWeight(seriesTargetAt(e.prescribed, i)?.targetWeightKg ?? null, e.lastWeightKg),
      ),
      reps: "",
      done: false,
      isWarmup: false,
    })),
  }));
}

export function createDraft(input: {
  workoutId: string;
  userId: string;
  plannedSession: { id: string; programId: string; label: string };
  exercises: PrefillExercise[];
  now: Date;
}): WorkoutDraft {
  return {
    version: 2,
    workoutId: input.workoutId,
    userId: input.userId,
    plannedSessionId: input.plannedSession.id,
    programId: input.plannedSession.programId,
    sessionLabel: input.plannedSession.label,
    startedAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    status: "in_progress",
    exercises: prefillDraftExercises(input.exercises),
  };
}

// --- helpers de actualización inmutable -------------------------------------------------------
function mapSet<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  setIdx: number,
  fn: (set: DraftSet) => DraftSet,
): T {
  const exercise = draft.exercises[exIdx];
  if (!exercise?.sets[setIdx]) return draft;
  return {
    ...draft,
    exercises: draft.exercises.map((e, i) =>
      i === exIdx ? { ...e, sets: e.sets.map((s, j) => (j === setIdx ? fn(s) : s)) } : e,
    ),
  };
}

function mapExercise<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  fn: (e: DraftExercise) => DraftExercise,
): T {
  if (!draft.exercises[exIdx]) return draft;
  return { ...draft, exercises: draft.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) };
}

export function updateSetField<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  setIdx: number,
  field: "weight" | "reps",
  value: string,
): T {
  const exercise = draft.exercises[exIdx];
  if (!exercise) return draft;
  return mapSet(draft, exIdx, setIdx, (s) => {
    const next = { ...s, [field]: value };
    return { ...next, done: s.done && canComplete(exercise, next) };
  });
}

export function setExerciseRestSeconds<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  restSeconds: number,
): T {
  if (
    !Number.isInteger(restSeconds) ||
    (restSeconds !== 0 && (restSeconds < MIN_REST_SECONDS || restSeconds > MAX_REST_SECONDS))
  ) {
    return draft;
  }
  const groupId = draft.exercises[exIdx]?.supersetId;
  if (groupId)
    return {
      ...draft,
      exercises: draft.exercises.map((e) =>
        e.supersetId === groupId ? { ...e, supersetRestSeconds: restSeconds } : e,
      ),
    };
  return mapExercise(draft, exIdx, (e) => ({ ...e, restSeconds }));
}

// Comparte la regla de volumen del historial; nunca cuenta valores de referencia sin marcar.
export function workoutVolume(draft: RunnerDraft): ReturnType<typeof setVolume> {
  return setVolume(
    draft.exercises.flatMap((exercise) => {
      if (exercise.skipped) return [];
      return exercise.sets.flatMap((set) => {
        if (!set.done || !canComplete(exercise, set)) return [];
        const result = toNumbers(exercise, set);
        return result.success ? [result.data] : [];
      });
    }),
  );
}

function toNumbers(exercise: DraftExercise, set: DraftSet) {
  const weightText = set.weight.trim();
  // Sin peso escrito: válido solo en peso corporal (se guarda como 0).
  const weight = weightText === "" && exercise.isBodyweight ? "0" : weightText;
  return workoutSetSchema.safeParse({ weightKg: weight, reps: set.reps, isWarmup: set.isWarmup });
}

// ¿Tiene la serie datos válidos para marcarla como hecha?
export function canComplete(exercise: DraftExercise, set: DraftSet): boolean {
  return set.weight.trim() !== "" || exercise.isBodyweight
    ? toNumbers(exercise, set).success
    : false;
}

export function toggleDone<T extends RunnerDraft>(draft: T, exIdx: number, setIdx: number): T {
  const exercise = draft.exercises[exIdx];
  const set = exercise?.sets[setIdx];
  if (!exercise || !set) return draft;
  if (!set.done && !canComplete(exercise, set)) return draft;
  return mapSet(draft, exIdx, setIdx, (s) => ({ ...s, done: !s.done }));
}

export function targetForSet(exercise: DraftExercise, setIdx: number) {
  const set = exercise.sets[setIdx];
  if (!set || set.isWarmup) return null;
  const index = exercise.sets.slice(0, setIdx).filter((s) => !s.isWarmup).length;
  return seriesTargetAt(exercise.prescribed, index);
}

export type PreviousSet = { weightKg: number; reps: number };

// "Anterior" de la fila (RF-53): la misma serie de la última vez. Una serie de trabajo se compara con
// la serie de trabajo del mismo número (los calentamientos no desplazan la cuenta) y un calentamiento
// con el calentamiento del mismo número.
export function previousForSet(
  last: { sets: { weightKg: number; reps: number; isWarmup: boolean }[] } | null,
  exercise: DraftExercise,
  setIdx: number,
): PreviousSet | null {
  const set = exercise.sets[setIdx];
  if (!last || !set) return null;
  const sameKind = (s: { isWarmup: boolean }) => s.isWarmup === set.isWarmup;
  const position = exercise.sets.slice(0, setIdx).filter(sameKind).length;
  const match = last.sets.filter(sameKind)[position];
  return match ? { weightKg: match.weightKg, reps: match.reps } : null;
}

// Tocar "anterior" copia peso y repeticiones a la fila (RF-54).
export function copyPrevious<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  setIdx: number,
  previous: PreviousSet,
): T {
  if (draft.exercises[exIdx]?.sets[setIdx]?.done) return draft;
  return mapSet(draft, exIdx, setIdx, (s) => ({
    ...s,
    weight: asText(previous.weightKg),
    reps: String(previous.reps),
  }));
}

export function copyLastPerformance<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  last: { sets: LastSet[] } | null,
): T {
  const exercise = draft.exercises[exIdx];
  if (!exercise || !last) return draft;
  return mapExercise(draft, exIdx, (e) => ({
    ...e,
    sets: e.sets.map((set, index) => {
      const previous = previousForSet(last, e, index);
      return set.done || !previous
        ? set
        : { ...set, weight: asText(previous.weightKg), reps: String(previous.reps) };
    }),
  }));
}

export function copySuggestedValues<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  values: PreviousSet,
): T {
  if (
    !draft.exercises[exIdx] ||
    !isUniformPrescription(draft.exercises[exIdx].prescribed) ||
    !workoutSetSchema.safeParse({ ...values, isWarmup: false }).success
  )
    return draft;
  return mapExercise(draft, exIdx, (e) => ({
    ...e,
    sets: e.sets.map((set) =>
      set.done || set.isWarmup
        ? set
        : { ...set, weight: asText(values.weightKg), reps: String(values.reps) },
    ),
  }));
}

// Marcar la serie sin bloquear al alumno (RF-55): completa lo que falte con la referencia
// (peso de "anterior", repeticiones de "anterior" o el mínimo prescrito; DC-27). Si la serie ya estaba
// hecha, la desmarca. `completed` solo es verdadero al marcarla (RF-60: desmarcar no inicia descanso).
export function completeSet<T extends RunnerDraft>(
  draft: T,
  exIdx: number,
  setIdx: number,
  previous: PreviousSet | null,
): { draft: T; completed: boolean; wasWarmup: boolean } {
  const exercise = draft.exercises[exIdx];
  const set = exercise?.sets[setIdx];
  if (!exercise || !set) return { draft, completed: false, wasWarmup: false };

  if (set.done) {
    return { draft: toggleDone(draft, exIdx, setIdx), completed: false, wasWarmup: set.isWarmup };
  }

  const target = targetForSet(exercise, setIdx);
  const filled = mapSet(draft, exIdx, setIdx, (s) => ({
    ...s,
    weight: s.weight.trim() === "" && previous ? asText(previous.weightKg) : s.weight,
    reps:
      s.reps.trim() === ""
        ? String(
            (exercise.prescribed.series ? target?.repsMin : previous?.reps) ??
              target?.repsMin ??
              exercise.prescribed.repsMin,
          )
        : s.reps,
  }));
  const next = toggleDone(filled, exIdx, setIdx);
  const completed = next.exercises[exIdx].sets[setIdx].done;
  return { draft: completed ? next : draft, completed, wasWarmup: set.isWarmup };
}

export function exerciseProgress(exercise: DraftExercise): { done: number; total: number } {
  return { done: exercise.sets.filter((s) => s.done).length, total: exercise.sets.length };
}

export function isExerciseComplete(exercise: DraftExercise): boolean {
  const { done, total } = exerciseProgress(exercise);
  return total > 0 && done === total;
}

export function nextPendingExercise(draft: RunnerDraft, afterId?: string): DraftExercise | null {
  const start = draft.exercises.findIndex((e) => e.sessionExerciseId === afterId) + 1;
  const ordered = [...draft.exercises.slice(start), ...draft.exercises.slice(0, start)];
  return ordered.find((e) => !e.skipped && e.sets.some((s) => !s.done)) ?? null;
}

export function toggleWarmup<T extends RunnerDraft>(draft: T, exIdx: number, setIdx: number): T {
  return mapSet(draft, exIdx, setIdx, (s) => ({ ...s, isWarmup: !s.isWarmup }));
}

export function addSet<T extends RunnerDraft>(draft: T, exIdx: number): T {
  return mapExercise(draft, exIdx, (e) => {
    const last = e.sets.at(-1);
    return {
      ...e,
      sets: [
        ...e.sets,
        {
          id: `${e.sessionExerciseId}-${Date.now().toString(36)}-${e.sets.length + 1}`,
          weight: last?.weight ?? "",
          reps: "",
          done: false,
          isWarmup: false,
        },
      ],
    };
  });
}

export function removeSet<T extends RunnerDraft>(draft: T, exIdx: number, setIdx: number): T {
  return mapExercise(draft, exIdx, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== setIdx) }));
}

export function setSkipped<T extends RunnerDraft>(draft: T, exIdx: number, skipped: boolean): T {
  return mapExercise(draft, exIdx, (e) => ({ ...e, skipped }));
}

export function summarize(draft: RunnerDraft): {
  doneSets: number;
  totalSets: number;
  skippedExercises: number;
} {
  const active = draft.exercises.filter((e) => !e.skipped);
  return {
    doneSets: active.flatMap((e) => e.sets).filter((s) => s.done).length,
    totalSets: active.flatMap((e) => e.sets).length,
    skippedExercises: draft.exercises.length - active.length,
  };
}

// --- cierre -----------------------------------------------------------------------------------
export type WorkoutPayload = {
  id: string;
  programId: string;
  programSessionId: string;
  sessionLabel: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  perceivedEffort?: number | null;
  note?: string | null;
  sets: {
    sessionExerciseId?: string;
    prescribedExerciseId?: string;
    exerciseId: string;
    exerciseName: string;
    position: number;
    setNumber: number;
    weightKg: number;
    reps: number;
    isWarmup: boolean;
  }[];
};

const secondsBetween = (from: string, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - Date.parse(from)) / 1000));

// Arma lo que se envía al servidor: solo series completadas y válidas (RF-23).
export function buildPayload(
  draft: WorkoutDraft,
  now: Date,
): { ok: true; payload: WorkoutPayload } | { ok: false; reason: "no_sets" } {
  const sets: WorkoutPayload["sets"] = [];

  draft.exercises.forEach((exercise, position) => {
    if (exercise.skipped) return;
    let setNumber = 0;
    for (const set of exercise.sets) {
      if (!set.done) continue;
      const parsed = toNumbers(exercise, set);
      if (!parsed.success) continue;
      setNumber += 1;
      sets.push({
        sessionExerciseId: exercise.sessionExerciseId,
        prescribedExerciseId: exercise.original?.exerciseId ?? exercise.exerciseId,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        position,
        setNumber,
        weightKg: parsed.data.weightKg,
        reps: parsed.data.reps,
        isWarmup: parsed.data.isWarmup,
      });
    }
  });

  if (sets.length === 0) return { ok: false, reason: "no_sets" };

  return {
    ok: true,
    payload: {
      id: draft.workoutId,
      programId: draft.programId,
      programSessionId: draft.plannedSessionId,
      sessionLabel: draft.sessionLabel,
      startedAt: draft.startedAt,
      finishedAt: draft.finishedAt ?? now.toISOString(),
      durationSeconds: draft.durationSeconds ?? secondsBetween(draft.startedAt, now),
      ...(draft.perceivedEffort !== undefined ? { perceivedEffort: draft.perceivedEffort } : {}),
      ...(draft.note !== undefined ? { note: draft.note?.trim() || null } : {}),
      sets,
    },
  };
}

// Marca la sesión como terminada pero aún no guardada en el servidor (RF-24): conserva el mismo id.
export function finishDraft<T extends RunnerDraft>(draft: T, now: Date): T {
  return {
    ...draft,
    status: "pending_save",
    rest: null,
    finishedAt: now.toISOString(),
    durationSeconds: secondsBetween(draft.startedAt, now),
    updatedAt: now.toISOString(),
  };
}
