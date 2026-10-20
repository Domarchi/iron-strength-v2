// Borrador de la sesión en curso (RF-22, RF-24, DC-8). Vive en localStorage: sobrevive a un
// refresco o a una navegación, y si el guardado final falla por falta de conexión se conserva como
// "pending_save" con el mismo id de entrenamiento para reintentar sin duplicar. Todo acceso al
// almacenamiento es defensivo: modo privado, cuota llena o datos corruptos nunca deben romper la app.
import { z } from "zod";

// Subconjunto de la API Storage del navegador (permite probarlo con un almacenamiento falso).
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "is:draft:v2:";
const LEGACY_PREFIX = "is:draft:v1:";

const setSchema = z.object({
  id: z.string(),
  weight: z.string(), // texto tal como lo escribe el alumno ("" = vacío)
  reps: z.string(),
  done: z.boolean(),
  isWarmup: z.boolean(),
});

const choiceSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  isBodyweight: z.boolean(),
  prescribed: z.object({
    sets: z.number(),
    repsMin: z.number(),
    repsMax: z.number(),
    targetWeightKg: z.number().nullable(),
  }),
  lastWeightKg: z.number().nullable(),
});

const exerciseSchema = z.object({
  sessionExerciseId: z.string(),
  exerciseId: z.string(),
  name: z.string(),
  isBodyweight: z.boolean().default(false),
  prescribed: z.object({
    sets: z.number(),
    repsMin: z.number(),
    repsMax: z.number(),
    targetWeightKg: z.number().nullable(),
  }),
  original: choiceSchema.optional(),
  alternatives: z.array(choiceSchema).max(3).optional(),
  skipped: z.boolean(),
  // Opcional para recuperar también borradores anteriores a T135 (90 s por defecto).
  restSeconds: z.union([z.literal(0), z.number().int().min(15).max(600)]).optional(),
  supersetId: z.string().optional(),
  supersetRestSeconds: z.union([z.literal(0), z.number().int().min(15).max(600)]).optional(),
  sets: z.array(setSchema),
});

const draftSchema = z.object({
  version: z.literal(1),
  workoutId: z.uuid(), // generado al iniciar: el servidor lo usa como clave idempotente
  userId: z.string(),
  plannedSessionId: z.string(),
  programId: z.string(),
  sessionLabel: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["in_progress", "pending_save"]),
  finishedAt: z.string().optional(),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  durationSeconds: z.number().optional(),
  rest: z
    .object({
      endsAt: z.number().finite().nonnegative(),
      totalSeconds: z.number().int().min(15).max(600),
    })
    .nullable()
    .catch(null)
    .optional(),
  exercises: z.array(exerciseSchema),
});

export type DraftSet = z.infer<typeof setSchema>;
export type DraftExercise = z.infer<typeof exerciseSchema>;
export type WorkoutDraft = z.infer<typeof draftSchema>;

export const draftKey = (userId: string, plannedSessionId: string) =>
  `${PREFIX}${userId}:${plannedSessionId}`;
export const legacyDraftKey = (userId: string, plannedSessionId: string) =>
  `${LEGACY_PREFIX}${userId}:${plannedSessionId}`;

function parse(raw: string | null): WorkoutDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const result = draftSchema.safeParse(value?.version === 2 ? value.draft : value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
function belongs(draft: WorkoutDraft | null, userId: string, sessionId: string) {
  return draft?.userId === userId && draft.plannedSessionId === sessionId;
}
export function loadDraft(
  storage: DraftStorage | undefined,
  userId: string,
  plannedSessionId: string,
): WorkoutDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(userId, plannedSessionId));
    const current = parse(raw);
    const old = parse(storage.getItem(legacyDraftKey(userId, plannedSessionId)));
    const value = belongs(current, userId, plannedSessionId)
      ? belongs(old, userId, plannedSessionId) &&
        old!.workoutId === current!.workoutId &&
        old!.updatedAt > current!.updatedAt
        ? old
        : current
      : belongs(old, userId, plannedSessionId)
        ? old
        : null;
    if (value) saveDraft(storage, value);
    // Un formato desconocido se conserva para una versión capaz de recuperarlo.
    return value;
  } catch {
    return null;
  }
}

export function saveDraft(storage: DraftStorage | undefined, draft: WorkoutDraft): boolean {
  if (!storage) return false;
  try {
    const key = draftKey(draft.userId, draft.plannedSessionId);
    const previousRaw = storage.getItem(key);
    const previous = parse(previousRaw);
    if (
      previousRaw !== null &&
      (!belongs(previous, draft.userId, draft.plannedSessionId) ||
        previous!.workoutId !== draft.workoutId)
    )
      return false;
    const encoded = JSON.stringify({ version: 2, draft });
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) return false;
    try {
      const oldKey = legacyDraftKey(draft.userId, draft.plannedSessionId);
      const oldRaw = storage.getItem(oldKey);
      const old = parse(oldRaw);
      if (
        belongs(old, draft.userId, draft.plannedSessionId) &&
        old!.workoutId === draft.workoutId &&
        old!.updatedAt <= draft.updatedAt &&
        storage.getItem(oldKey) === oldRaw
      )
        storage.removeItem(oldKey);
    } catch {
      // La copia v2 ya está confirmada; conservar v1 no invalida el guardado.
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(
  storage: DraftStorage | undefined,
  userId: string,
  plannedSessionId: string,
  workoutId?: string,
): void {
  if (!storage) return;
  try {
    for (const key of [
      draftKey(userId, plannedSessionId),
      legacyDraftKey(userId, plannedSessionId),
    ]) {
      const raw = storage.getItem(key);
      const value = parse(raw);
      if (
        !workoutId ||
        (belongs(value, userId, plannedSessionId) && value!.workoutId === workoutId)
      )
        if (storage.getItem(key) === raw) storage.removeItem(key);
    }
  } catch {
    // La copia confirmada en servidor permite reintentar la limpieza.
  }
}
export function listDrafts(storage: DraftStorage | undefined, userId: string): WorkoutDraft[] {
  if (!storage) return [];
  try {
    const drafts = new Map<string, WorkoutDraft>();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || ![PREFIX, LEGACY_PREFIX].some((p) => key.startsWith(`${p}${userId}:`))) continue;
      const draft = parse(storage.getItem(key));
      if (
        !draft ||
        draft.userId !== userId ||
        ![
          draftKey(userId, draft.plannedSessionId),
          legacyDraftKey(userId, draft.plannedSessionId),
        ].includes(key)
      )
        continue;
      const existing = drafts.get(draft.workoutId);
      if (!existing || draft.updatedAt > existing.updatedAt) drafts.set(draft.workoutId, draft);
    }
    return [...drafts.values()];
  } catch {
    return [];
  }
}
export function migrateDrafts(storage: DraftStorage, userId: string): void {
  for (const draft of listDrafts(storage, userId))
    loadDraft(storage, userId, draft.plannedSessionId);
}
