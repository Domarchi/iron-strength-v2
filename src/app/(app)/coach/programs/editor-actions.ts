"use server";

import { configureSessionLayout } from "@/lib/data/session-layout";
import type { LayoutRequest } from "@/lib/coach/routine-layout";
import { configureAlternatives } from "@/lib/data/routine-alternatives";
import type { AlternativeRequest } from "@/lib/coach/routine-alternatives";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sessionExerciseSchema } from "@/domain/schemas";
import { requireCoach } from "@/lib/auth/session";
import {
  getProgramTree,
  saveSessionPrescriptions,
  addSessionExercise,
  reorderSessionExercises,
  duplicateRoutineItem,
  type Failure,
} from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";

export type EditorResult = {
  error: string | null;
  savedIds: string[];
  uncertain?: boolean;
  conflict?: boolean;
  revision?: number;
};
const messages: Record<Failure, string> = {
  conflict:
    "La sesión cambió en otra pestaña. Tus cambios siguen aquí; revisa la versión actual antes de guardarlos.",
  invalid: "Revisa los datos ingresados.",
  forbidden: "No tienes permiso para modificar esta sesión.",
  not_found: "La sesión o uno de sus ejercicios cambió. Recarga antes de continuar.",
  week_locked: "La semana está bloqueada: solo puedes editar las semanas posteriores a la actual.",
  limit: "La sesión admite hasta 15 ejercicios.",
};
const temporaryError =
  "No se pudo completar la operación. Los cambios pendientes se conservan; vuelve a intentar.";
function readJson(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(String(fd.get(key) ?? ""));
  } catch {
    return null;
  }
}
function mutationIdentity(fd: FormData) {
  return z.object({ requestId: z.uuid(), expectedRevision: z.number().int().min(0) }).safeParse({
    requestId: fd.get("requestId"),
    expectedRevision: fd.has("revision") ? Number(fd.get("revision")) : -1,
  });
}
function refresh(programId: string) {
  revalidatePath(`/coach/programs/${programId}`);
  revalidatePath("/coach/programs");
}

export async function savePrescriptionsAction(fd: FormData): Promise<EditorResult> {
  await requireCoach();
  const identity = mutationIdentity(fd);
  if (!identity.success) return { error: messages.invalid, savedIds: [] };
  const parsed = z
    .array(sessionExerciseSchema.extend({ id: z.string().min(1) }))
    .min(1)
    .max(15)
    .safeParse(readJson(fd, "rows"));
  if (!parsed.success || new Set(parsed.data.map((r) => r.id)).size !== parsed.data.length)
    return { error: messages.invalid, savedIds: [] };
  const programId = String(fd.get("programId") ?? "");
  const db = await createClient();
  const tree = await getProgramTree(db, programId);
  const session = tree?.sessions.find((s) => s.id === fd.get("sessionId"));
  // No se permite que el lote apunte a ejercicios de otra sesión, ni sustituya su identidad.
  if (
    !session ||
    parsed.data.some(
      (row) => !session.exercises.some((e) => e.id === row.id && e.exerciseId === row.exerciseId),
    )
  )
    return { error: messages.not_found, savedIds: [], conflict: true };
  try {
    const result = await saveSessionPrescriptions({
      db,
      sessionId: session.id,
      rows: parsed.data,
      ...identity.data,
    });
    if (!result.ok)
      return {
        error: messages[result.reason],
        savedIds: [],
        conflict: result.reason === "conflict",
      };
    refresh(programId);
    return { error: null, savedIds: parsed.data.map((row) => row.id), revision: result.revision };
  } catch {
    return { error: temporaryError, savedIds: [], uncertain: true };
  }
}

export async function addExercisesAction(fd: FormData): Promise<EditorResult> {
  await requireCoach();
  const parsed = z.array(z.uuid()).min(1).max(15).safeParse(readJson(fd, "exerciseIds"));
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length)
    return { error: messages.invalid, savedIds: [] };
  const programId = String(fd.get("programId") ?? "");
  const db = await createClient();
  const tree = await getProgramTree(db, programId);
  const session = tree?.sessions.find((s) => s.id === fd.get("sessionId"));
  if (!session) return { error: messages.not_found, savedIds: [] };
  if (session.exercises.length + parsed.data.length > 15)
    return { error: messages.limit, savedIds: [] };
  const savedIds: string[] = [];
  let error: string | null = null;
  try {
    for (const exerciseId of parsed.data) {
      const result = await addSessionExercise({
        db,
        sessionId: session.id,
        input: { exerciseId, sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: null, note: null },
      });
      if (!result.ok) {
        error = messages[result.reason];
        break;
      }
      savedIds.push(exerciseId);
    }
  } catch {
    error = temporaryError;
  }
  if (savedIds.length) refresh(programId);
  return { savedIds, error };
}

export async function reorderExercisesAction(fd: FormData): Promise<EditorResult> {
  await requireCoach();
  const identity = mutationIdentity(fd);
  if (!identity.success) return { error: messages.invalid, savedIds: [] };
  const parsed = z.array(z.string().min(1)).min(2).max(15).safeParse(readJson(fd, "orderedIds"));
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length)
    return { error: messages.invalid, savedIds: [] };
  const programId = String(fd.get("programId") ?? "");
  const db = await createClient();
  const tree = await getProgramTree(db, programId);
  const session = tree?.sessions.find((s) => s.id === fd.get("sessionId"));
  if (
    !session ||
    session.exercises.length !== parsed.data.length ||
    parsed.data.some((id) => !session.exercises.some((e) => e.id === id))
  )
    return { error: messages.not_found, savedIds: [] };
  try {
    const result = await reorderSessionExercises({
      db,
      sessionId: session.id,
      orderedIds: parsed.data,
      ...identity.data,
    });
    refresh(programId);
    return result.ok
      ? { error: null, savedIds: parsed.data, revision: result.revision }
      : { error: messages[result.reason], savedIds: [], conflict: result.reason === "conflict" };
  } catch {
    refresh(programId);
    return { error: temporaryError, savedIds: [], uncertain: true };
  }
}

export async function duplicateRoutineAction(fd: FormData): Promise<EditorResult> {
  await requireCoach();
  const copyId = z.uuid().safeParse(fd.get("copyId"));
  if (!copyId.success) return { error: messages.invalid, savedIds: [] };
  const programId = String(fd.get("programId") ?? "");
  const exerciseId = String(fd.get("exerciseId") ?? "") || undefined;
  try {
    const db = await createClient();
    const tree = await getProgramTree(db, programId);
    const session = tree?.sessions.find((s) => s.id === fd.get("sessionId"));
    if (!session || (exerciseId && !session.exercises.some((e) => e.id === exerciseId)))
      return { error: messages.not_found, savedIds: [] };
    const result = await duplicateRoutineItem({
      db,
      sessionId: session.id,
      copyId: copyId.data,
      exerciseId,
    });
    refresh(programId);
    if (result.ok) return { error: null, savedIds: [result.id] };
    const error =
      result.reason === "limit"
        ? exerciseId
          ? messages.limit
          : "La semana admite hasta 7 sesiones."
        : result.reason === "invalid"
          ? "Quita los ejercicios archivados antes de duplicar y revisa el origen de la copia."
          : messages[result.reason];
    return { error, savedIds: [] };
  } catch {
    return {
      error: "No se pudo confirmar la copia. Puedes reintentar sin crear otra copia.",
      savedIds: [],
      uncertain: true,
    };
  }
}

export async function reviewSessionAction(programId: string, sessionId: string) {
  await requireCoach();
  const tree = await getProgramTree(await createClient(), programId);
  return tree?.sessions.find((session) => session.id === sessionId) ?? null;
}

export async function configureLayoutAction(
  programId: string,
  sessionId: string,
  request: LayoutRequest,
): Promise<EditorResult> {
  await requireCoach();
  try {
    const db = await createClient();
    const tree = await getProgramTree(db, programId);
    if (!tree?.sessions.some((s) => s.id === sessionId))
      return { error: messages.not_found, savedIds: [] };
    const result = await configureSessionLayout(db, sessionId, request);
    if (!result.ok)
      return {
        error: messages[result.reason],
        savedIds: [],
        conflict: result.reason === "conflict",
      };
    refresh(programId);
    return {
      error: null,
      savedIds: request.layout.map((row) => row.id),
      revision: result.revision,
    };
  } catch {
    return {
      error: "No se pudo confirmar la configuración. Reintenta sin repetir la operación.",
      savedIds: [],
      uncertain: true,
    };
  }
}

export async function configureAlternativesAction(
  programId: string,
  sessionId: string,
  request: AlternativeRequest,
): Promise<EditorResult> {
  await requireCoach();
  try {
    const db = await createClient();
    const tree = await getProgramTree(db, programId);
    if (!tree?.sessions.some((s) => s.id === sessionId))
      return { error: messages.not_found, savedIds: [] };
    const result = await configureAlternatives(db, sessionId, request);
    if (!result.ok)
      return {
        error: messages[result.reason],
        savedIds: [],
        conflict: result.reason === "conflict",
      };
    refresh(programId);
    return { error: null, savedIds: [request.exerciseRowId], revision: result.revision };
  } catch {
    return {
      error: "No se pudo confirmar el guardado de alternativas. Reintenta con la misma solicitud.",
      savedIds: [],
      uncertain: true,
    };
  }
}
