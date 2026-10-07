"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { saveWorkout, type SaveWorkoutResult } from "@/lib/data/save-workout";
import { createClient } from "@/lib/supabase/server";

// Guarda un entrenamiento terminado. El cliente conserva su borrador hasta recibir ok: true.
// Es idempotente por el id del entrenamiento, así que reintentar tras un corte de red es seguro.
export async function saveWorkoutAction(payload: unknown): Promise<SaveWorkoutResult> {
  await requireUser();
  const result = await saveWorkout({ db: await createClient(), payload });
  if (result.ok) {
    revalidatePath("/week");
    revalidatePath("/history");
  }
  return result;
}
