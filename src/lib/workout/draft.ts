// Borrador de la sesión en curso (RF-22, RF-24, DC-8). Vive en localStorage: sobrevive a un
// refresco o a una navegación, y si el guardado final falla por falta de conexión se conserva como
// "pending_save" con el mismo id de entrenamiento para reintentar sin duplicar. Todo acceso al
// almacenamiento es defensivo: modo privado, cuota llena o datos corruptos nunca deben romper la app.
import { z } from "zod";

// Subconjunto de la API Storage del navegador (permite probarlo con un almacenamiento falso).
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "is:draft:v1:";

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

function parse(raw: string | null): WorkoutDraft | null {
  if (!raw) return null;
  try {
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function loadDraft(
  storage: DraftStorage | undefined,
  userId: string,
  plannedSessionId: string,
): WorkoutDraft | null {
  if (!storage) return null;
  const key = draftKey(userId, plannedSessionId);
  try {
    const draft = parse(storage.getItem(key));
    // Un borrador cuyo contenido no corresponde a su clave es basura (o de otra cuenta).
    if (draft && draft.userId === userId && draft.plannedSessionId === plannedSessionId)
      return draft;
    if (storage.getItem(key) !== null) storage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

// Devuelve false si no se pudo guardar (el alumno puede seguir: el borrador solo es una red de seguridad).
export function saveDraft(storage: DraftStorage | undefined, draft: WorkoutDraft): boolean {
  if (!storage) return false;
  try {
    storage.setItem(draftKey(draft.userId, draft.plannedSessionId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(
  storage: DraftStorage | undefined,
  userId: string,
  plannedSessionId: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(userId, plannedSessionId));
  } catch {
    // sin almacenamiento disponible: nada que limpiar
  }
}

export function listDrafts(storage: DraftStorage | undefined, userId: string): WorkoutDraft[] {
  if (!storage) return [];
  try {
    const prefix = `${PREFIX}${userId}:`;
    const drafts: WorkoutDraft[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const draft = parse(storage.getItem(key));
      if (draft && draft.userId === userId) drafts.push(draft);
    }
    return drafts;
  } catch {
    return [];
  }
}
