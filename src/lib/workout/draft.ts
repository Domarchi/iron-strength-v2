// Borrador de la sesión en curso (RF-22, RF-24, DC-8). Vive en localStorage: sobrevive a un
// refresco o a una navegación, y si el guardado final falla por falta de conexión se conserva como
// "pending_save" con el mismo id de entrenamiento para reintentar sin duplicar. Todo acceso al
// almacenamiento es defensivo: modo privado, cuota llena o datos corruptos nunca deben romper la app.
import { z } from "zod";
import { prescribedSeriesSchema, coherentPrescriptionSeries } from "@/domain/prescription-series";

// Subconjunto de la API Storage del navegador (permite probarlo con un almacenamiento falso).
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "is:draft:v3:";
const PREVIOUS_PREFIX = "is:draft:v2:";
const LEGACY_PREFIX = "is:draft:v1:";

const setSchema = z.object({
  id: z.string(),
  weight: z.string(), // texto tal como lo escribe el alumno ("" = vacío)
  reps: z.string(),
  done: z.boolean(),
  isWarmup: z.boolean(),
});

const prescribedSchema = z
  .object({
    sets: z.number(),
    repsMin: z.number(),
    repsMax: z.number(),
    targetWeightKg: z.number().nullable(),
    series: prescribedSeriesSchema.nullable().optional(),
  })
  .refine(coherentPrescriptionSeries);

const choiceSchema = z.object({
  exerciseId: z.string(),
  name: z.string(),
  isBodyweight: z.boolean(),
  prescribed: prescribedSchema,
  lastWeightKg: z.number().nullable(),
});

const exerciseSchema = z.object({
  sessionExerciseId: z.string(),
  exerciseId: z.string(),
  name: z.string(),
  isBodyweight: z.boolean().default(false),
  prescribed: prescribedSchema,
  original: choiceSchema.optional(),
  alternatives: z.array(choiceSchema).max(3).optional(),
  skipped: z.boolean(),
  // Opcional para recuperar también borradores anteriores a T135 (90 s por defecto).
  restSeconds: z.union([z.literal(0), z.number().int().min(15).max(600)]).optional(),
  supersetId: z.string().optional(),
  supersetRestSeconds: z.union([z.literal(0), z.number().int().min(15).max(600)]).optional(),
  sets: z.array(setSchema),
});

const draftSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
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
  })
  .refine(
    (d) =>
      d.version === 2 ||
      d.exercises.every((e) =>
        [e, ...(e.original ? [e.original] : []), ...(e.alternatives ?? [])].every(
          (c) => c.prescribed.series === undefined,
        ),
      ),
  );

export type DraftSet = z.infer<typeof setSchema>;
export type DraftExercise = z.infer<typeof exerciseSchema>;
export type WorkoutDraft = z.infer<typeof draftSchema>;

export const workoutFocusKey = (userId: string, workoutId: string) =>
  `is:workout-focus:v1:${userId}:${workoutId}`;

export const draftKey = (userId: string, plannedSessionId: string) =>
  `${PREFIX}${userId}:${plannedSessionId}`;
export const previousDraftKey = (userId: string, plannedSessionId: string) =>
  `${PREVIOUS_PREFIX}${userId}:${plannedSessionId}`;
export const legacyDraftKey = (userId: string, plannedSessionId: string) =>
  `${LEGACY_PREFIX}${userId}:${plannedSessionId}`;

function parse(raw: string | null): WorkoutDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const body =
      value?.version === 3 && value.draft?.version === 2
        ? value.draft
        : value?.version === 2 && value.draft?.version === 1
          ? value.draft
          : value?.version === 1 && !value.draft
            ? value
            : null;
    const result = draftSchema.safeParse(body);
    return result.success ? { ...result.data, version: 2 } : null;
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
    const keys = [
      draftKey(userId, plannedSessionId),
      previousDraftKey(userId, plannedSessionId),
      legacyDraftKey(userId, plannedSessionId),
    ];
    const snapshots = new Map(keys.map((k) => [k, storage.getItem(k)]));
    const candidates = keys
      .map((key) => parse(snapshots.get(key) ?? null))
      .filter((d): d is WorkoutDraft => belongs(d, userId, plannedSessionId));
    const primary = candidates[0];
    const value = primary
      ? candidates
          .filter((d) => d.workoutId === primary.workoutId)
          .reduce((a, d) => (d.updatedAt > a.updatedAt ? d : a), primary)
      : null;
    if (value) writeDraft(storage, value, snapshots);
    // Formatos desconocidos y otras sesiones conservan su origen.
    return value;
  } catch {
    return null;
  }
}

export function saveDraft(storage: DraftStorage | undefined, draft: WorkoutDraft): boolean {
  return writeDraft(storage, draft);
}
function writeDraft(
  storage: DraftStorage | undefined,
  draft: WorkoutDraft,
  snapshots?: Map<string, string | null>,
): boolean {
  if (!storage) return false;
  try {
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) return false;
    const key = draftKey(draft.userId, draft.plannedSessionId);
    const previousRaw = storage.getItem(key);
    const previous = parse(previousRaw);
    if (
      previousRaw !== null &&
      (!belongs(previous, draft.userId, draft.plannedSessionId) ||
        previous!.workoutId !== draft.workoutId)
    )
      return false;
    const encoded = JSON.stringify({ version: 3, draft: { ...parsed.data, version: 2 } });
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) return false;
    try {
      for (const oldKey of [
        previousDraftKey(draft.userId, draft.plannedSessionId),
        legacyDraftKey(draft.userId, draft.plannedSessionId),
      ]) {
        const oldRaw = storage.getItem(oldKey),
          old = parse(oldRaw);
        if (
          belongs(old, draft.userId, draft.plannedSessionId) &&
          old!.workoutId === draft.workoutId &&
          old!.updatedAt <= draft.updatedAt &&
          (!snapshots || snapshots.get(oldKey) === oldRaw) &&
          storage.getItem(oldKey) === oldRaw
        )
          storage.removeItem(oldKey);
      }
    } catch {
      // La copia v3 ya está confirmada; conservar el origen no invalida el guardado.
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
      previousDraftKey(userId, plannedSessionId),
      legacyDraftKey(userId, plannedSessionId),
    ]) {
      const raw = storage.getItem(key);
      const value = parse(raw);
      if (
        belongs(value, userId, plannedSessionId) &&
        (!workoutId || value!.workoutId === workoutId)
      )
        if (storage.getItem(key) === raw) {
          storage.removeItem(key);
          if (value) storage.removeItem(workoutFocusKey(userId, value.workoutId));
        }
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
      if (
        !key ||
        ![PREFIX, PREVIOUS_PREFIX, LEGACY_PREFIX].some((p) => key.startsWith(`${p}${userId}:`))
      )
        continue;
      const draft = parse(storage.getItem(key));
      if (
        !draft ||
        draft.userId !== userId ||
        ![
          draftKey(userId, draft.plannedSessionId),
          previousDraftKey(userId, draft.plannedSessionId),
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
