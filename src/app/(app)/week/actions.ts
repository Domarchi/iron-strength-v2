"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { moveSessionDay } from "@/lib/data/session-schedule";
export async function moveDayAction(
  sessionId: string,
  weekday: number | null,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  try {
    const result = await moveSessionDay(await createClient(), user.id, sessionId, weekday);
    if (!result.ok)
      return { error: "No se pudo mover la sesión. Solo puedes organizar tu semana vigente." };
    revalidatePath("/week");
    return { error: null };
  } catch {
    return { error: "No se pudo confirmar el día. Reintenta cuando tengas conexión." };
  }
}

export async function previewRoutineAction(
  sessionId: string,
): Promise<
  | { ok: true; context: import("@/lib/data/workout-context").WorkoutContext }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const { z } = await import("zod");
  if (!z.uuid().safeParse(sessionId).success)
    return { ok: false, error: "La sesión no está disponible." };
  try {
    const { getWorkoutContext } = await import("@/lib/data/workout-context");
    const result = await getWorkoutContext(await createClient(), user.id, sessionId);
    return result.ok && result.canStart
      ? { ok: true, context: result.context }
      : { ok: false, error: "Solo puedes consultar las rutinas de tu semana vigente." };
  } catch {
    return { ok: false, error: "No se pudo consultar la rutina. Reintenta con conexión." };
  }
}
