"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAssignedTrainingContext } from "@/lib/data/assigned-training-context";
import { saveTypedWorkoutRecording } from "@/lib/data/typed-recordings";
import { createAssignedWebOperations } from "@/lib/workout/assigned-web-operations";
import { z } from "zod";
import { listTypedExerciseHistory } from "@/lib/data/typed-exercises";
import { parseExerciseHistoryCursor } from "@/lib/mobile/exercise-contracts";

function operations() {
  return createAssignedWebOperations({
    async authorize() {
      const user = await getCurrentUser();
      if (!user) return null;
      const db = await createClient();
      return {
        userId: user.id.toLowerCase(),
        read: (id) => getAssignedTrainingContext(db, user.id, id),
        save: (payload) => saveTypedWorkoutRecording(db, payload),
      };
    },
  });
}
export async function readAssignedTrainingAction(value: unknown) {
  return operations().read(value);
}
export async function saveAssignedTrainingAction(value: unknown) {
  const result = await operations().save(value);
  if (result.ok)
    for (const path of ["/week", "/history", "/progress", `/history/${result.value.workoutId}`])
      revalidatePath(path);
  return result;
}
export async function readTypedExerciseHistoryAction(value: unknown) {
  const request = z
    .object({ userId: z.uuid(), exerciseId: z.uuid(), cursor: z.string().max(256).nullable() })
    .strict()
    .safeParse(value);
  if (!request.success)
    return { ok: false as const, error: "La consulta de historial no es válida." };
  try {
    const user = await getCurrentUser();
    if (!user || user.id !== request.data.userId)
      return { ok: false as const, error: "La cuenta cambió. Conservamos tu entrenamiento." };
    const cursor =
      request.data.cursor === null ? undefined : parseExerciseHistoryCursor(request.data.cursor);
    if (cursor === null)
      return { ok: false as const, error: "El filtro de historial no es válido." };
    return {
      ok: true as const,
      history: await listTypedExerciseHistory(
        await createClient(),
        user.id,
        request.data.exerciseId,
        { cursor },
      ),
    };
  } catch {
    return {
      ok: false as const,
      error: "No se pudo consultar el historial. Reintenta con conexión.",
    };
  }
}
