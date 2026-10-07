"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { deleteWorkout, updateWorkoutSets, type EditResult } from "@/lib/data/workout-edit";
import { createClient } from "@/lib/supabase/server";

export type EditState = { error: string | null };

const MESSAGES: Record<Extract<EditResult, { ok: false }>["reason"], string> = {
  not_found: "No se encontró el entrenamiento o no tienes permiso para modificarlo.",
  locked: "Solo puedes modificar un entrenamiento hasta 7 días después de su fecha.",
  invalid: "Revisa los pesos (0 a 500 kg) y las repeticiones (1 a 100).",
  no_sets:
    "Un entrenamiento necesita al menos una serie. Si quieres quitarlo, usa “Eliminar entrenamiento”.",
};

export async function updateWorkoutAction(
  workoutId: string,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  await requireUser();
  const ids = formData.getAll("setId").map(String);

  const result = await updateWorkoutSets({
    db: await createClient(),
    workoutId,
    sets: ids
      .filter((id) => formData.get(`remove-${id}`) !== "on")
      .map((id) => ({
        id,
        weightKg: String(formData.get(`weight-${id}`) ?? ""),
        reps: String(formData.get(`reps-${id}`) ?? ""),
        isWarmup: formData.get(`warmup-${id}`) === "on",
      })),
    removeSetIds: ids.filter((id) => formData.get(`remove-${id}`) === "on"),
  });
  if (!result.ok) return { error: MESSAGES[result.reason] };

  revalidatePath("/history");
  revalidatePath(`/history/${workoutId}`);
  redirect(`/history/${workoutId}`);
}

export async function deleteWorkoutAction(workoutId: string): Promise<EditState> {
  await requireUser();
  const result = await deleteWorkout({ db: await createClient(), workoutId });
  if (!result.ok) return { error: MESSAGES[result.reason] };

  revalidatePath("/history");
  revalidatePath("/week");
  redirect("/history");
}
