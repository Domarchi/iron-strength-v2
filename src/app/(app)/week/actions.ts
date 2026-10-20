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
