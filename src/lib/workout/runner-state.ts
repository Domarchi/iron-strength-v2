// Lógica pura de la sesión en curso (RF-20 a RF-24, RF-26; DC-6, DC-9). Funciones inmutables sobre
// el borrador: la interfaz solo las llama y persiste el resultado. Los números se guardan como
// texto mientras el alumno escribe y se convierten (con los límites de la spec) al finalizar.
import { workoutSetSchema } from "../../domain/schemas.ts";
import { prefillWeight } from "../../domain/progression.ts";
import type { DraftExercise, DraftSet, WorkoutDraft } from "./draft.ts";

export type PrefillExercise = {
  sessionExerciseId: string;
  exerciseId: string;
  name: string;
  isBodyweight: boolean;
  prescribed: DraftExercise["prescribed"];
  lastWeightKg: number | null; // último peso usado en este ejercicio (cualquier programa)
};

const asText = (kg: number | null) => (kg === null ? "" : String(kg).replace(".", ","));

export function createDraft(input: {
  workoutId: string;
  userId: string;
  plannedSession: { id: string; programId: string; label: string };
  exercises: PrefillExercise[];
  now: Date;
}): WorkoutDraft {
  return {
    version: 1,
    workoutId: input.workoutId,
    userId: input.userId,
    plannedSessionId: input.plannedSession.id,
    programId: input.plannedSession.programId,
    sessionLabel: input.plannedSession.label,
    startedAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    status: "in_progress",
    exercises: input.exercises.map((e) => ({
      sessionExerciseId: e.sessionExerciseId,
      exerciseId: e.exerciseId,
      name: e.name,
      isBodyweight: e.isBodyweight,
      prescribed: e.prescribed,
      skipped: false,
      sets: Array.from({ length: e.prescribed.sets }, (_, i) => ({
        id: `${e.sessionExerciseId}-${i + 1}`,
        weight: asText(prefillWeight(e.prescribed.targetWeightKg, e.lastWeightKg)),
        reps: "",
        done: false,
        isWarmup: false,
      })),
    })),
  };
}

// --- helpers de actualización inmutable -------------------------------------------------------
function mapSet(
  draft: WorkoutDraft,
  exIdx: number,
  setIdx: number,
  fn: (set: DraftSet) => DraftSet,
): WorkoutDraft {
  const exercise = draft.exercises[exIdx];
  if (!exercise?.sets[setIdx]) return draft;
  return {
    ...draft,
    exercises: draft.exercises.map((e, i) =>
      i === exIdx ? { ...e, sets: e.sets.map((s, j) => (j === setIdx ? fn(s) : s)) } : e,
    ),
  };
}

function mapExercise(
  draft: WorkoutDraft,
  exIdx: number,
  fn: (e: DraftExercise) => DraftExercise,
): WorkoutDraft {
  if (!draft.exercises[exIdx]) return draft;
  return { ...draft, exercises: draft.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) };
}

export function updateSetField(
  draft: WorkoutDraft,
  exIdx: number,
  setIdx: number,
  field: "weight" | "reps",
  value: string,
): WorkoutDraft {
  return mapSet(draft, exIdx, setIdx, (s) => ({ ...s, [field]: value }));
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

export function toggleDone(draft: WorkoutDraft, exIdx: number, setIdx: number): WorkoutDraft {
  const exercise = draft.exercises[exIdx];
  const set = exercise?.sets[setIdx];
  if (!exercise || !set) return draft;
  if (!set.done && !canComplete(exercise, set)) return draft;
  return mapSet(draft, exIdx, setIdx, (s) => ({ ...s, done: !s.done }));
}

export function toggleWarmup(draft: WorkoutDraft, exIdx: number, setIdx: number): WorkoutDraft {
  return mapSet(draft, exIdx, setIdx, (s) => ({ ...s, isWarmup: !s.isWarmup }));
}

export function addSet(draft: WorkoutDraft, exIdx: number): WorkoutDraft {
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

export function removeSet(draft: WorkoutDraft, exIdx: number, setIdx: number): WorkoutDraft {
  return mapExercise(draft, exIdx, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== setIdx) }));
}

export function setSkipped(draft: WorkoutDraft, exIdx: number, skipped: boolean): WorkoutDraft {
  return mapExercise(draft, exIdx, (e) => ({ ...e, skipped }));
}

export function summarize(draft: WorkoutDraft): {
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
  sets: {
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
      sets,
    },
  };
}

// Marca la sesión como terminada pero aún no guardada en el servidor (RF-24): conserva el mismo id.
export function finishDraft(draft: WorkoutDraft, now: Date): WorkoutDraft {
  return {
    ...draft,
    status: "pending_save",
    finishedAt: now.toISOString(),
    durationSeconds: secondsBetween(draft.startedAt, now),
    updatedAt: now.toISOString(),
  };
}
