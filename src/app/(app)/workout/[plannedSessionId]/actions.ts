"use server";

import { revalidatePath } from "next/cache";
import type { AchievementKind } from "@/domain/achievements";
import { requireUser } from "@/lib/auth/session";
import { syncAchievements } from "@/lib/data/achievements";
import { saveWorkout, type SaveWorkoutResult } from "@/lib/data/save-workout";
import { createClient } from "@/lib/supabase/server";

export type SaveWorkoutActionResult = SaveWorkoutResult & { achievements?: AchievementKind[] };

// Guarda un entrenamiento terminado. El cliente conserva su borrador hasta recibir ok: true.
// Es idempotente por el id del entrenamiento, así que reintentar tras un corte de red es seguro.
export async function saveWorkoutAction(payload: unknown): Promise<SaveWorkoutActionResult> {
  const user = await requireUser();
  const db = await createClient();
  const result = await saveWorkout({ db, payload });
  if (!result.ok) return result;

  revalidatePath("/week");
  revalidatePath("/history");

  // Los logros (RF-31) nunca bloquean el guardado: si algo falla aquí, el entrenamiento ya está a salvo
  // y los logros se otorgarán en el próximo guardado.
  let achievements: AchievementKind[] = [];
  try {
    const workoutId = (payload as { id?: unknown } | null)?.id;
    achievements = await syncAchievements({
      db,
      studentId: user.id,
      workoutId: typeof workoutId === "string" ? workoutId : undefined,
    });
  } catch {
    achievements = [];
  }
  return { ...result, achievements };
}
