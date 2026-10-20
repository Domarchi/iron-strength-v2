"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sessionExerciseSchema } from "@/domain/schemas";
import { requireCoach } from "@/lib/auth/session";
import {
  getProgramTree,
  updateSessionExercise,
  addSessionExercise,
  reorderSessionExercises,
  type Failure,
} from "@/lib/data/programs";
import { createClient } from "@/lib/supabase/server";

export type EditorResult = { error: string | null; savedIds: string[] };
const messages: Record<Failure, string> = {
  invalid: "Revisa los datos ingresados.",
  forbidden: "No tienes permiso para modificar esta sesión.",
  not_found: "La sesión o uno de sus ejercicios cambió. Recarga antes de continuar.",
  week_locked: "La semana está bloqueada: solo puedes editar la actual y las futuras.",
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
function refresh(programId: string) {
  revalidatePath(`/coach/programs/${programId}`);
  revalidatePath("/coach/programs");
}

export async function savePrescriptionsAction(fd: FormData): Promise<EditorResult> {
  await requireCoach();
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
    return { error: messages.not_found, savedIds: [] };
  const savedIds: string[] = [];
  let error: string | null = null;
  try {
    for (const row of parsed.data) {
      const result = await updateSessionExercise({ db, id: row.id, input: row });
      if (!result.ok) {
        error = messages[result.reason];
        break;
      }
      savedIds.push(row.id);
    }
  } catch {
    error = temporaryError;
  }
  if (savedIds.length) refresh(programId);
  return { savedIds, error };
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
    });
    refresh(programId);
    return result.ok
      ? { error: null, savedIds: parsed.data }
      : { error: messages[result.reason], savedIds: [] };
  } catch {
    refresh(programId);
    return { error: temporaryError, savedIds: [] };
  }
}
