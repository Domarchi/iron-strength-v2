"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireCoach } from "@/lib/auth/session";
import {
  archiveExercise,
  createExercise,
  restoreExercise,
  updateExercise,
  type WriteResult,
} from "@/lib/data/exercises";
import { createClient } from "@/lib/supabase/server";

export type ExerciseFormState = { error: string | null; saved?: boolean };

const MESSAGES: Record<Extract<WriteResult, { ok: false }>["reason"], string> = {
  invalid: "Revisa los datos del ejercicio y el incremento de carga (mayor que 0 y hasta 20 kg).",
  name_taken: "Ya existe un ejercicio con ese nombre.",
  forbidden: "No tienes permiso para editar la biblioteca.",
  not_found:
    "Ese ejercicio no existe o no se puede editar (los del catálogo base son de solo lectura).",
};

function readInput(formData: FormData) {
  return {
    name: formData.get("name"),
    muscleGroup: formData.get("muscleGroup"),
    equipment: formData.get("equipment"),
    progressionIncrementKg: formData.get("progressionIncrementKg"),
  };
}

export async function createExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const coach = await requireCoach();
  try {
    const result = await createExercise({
      db: await createClient(),
      coachId: coach.id,
      input: {
        ...readInput(formData),
        recordType: formData.has("recordType") ? formData.get("recordType") : null,
      },
    });
    if (!result.ok) return { error: MESSAGES[result.reason] };
    revalidatePath("/coach/exercises");
    return { error: null, saved: true };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        "No se pudo confirmar el guardado. Busca el nombre en la biblioteca antes de reintentar.",
    };
  }
}

export async function updateExerciseAction(
  id: string,
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  await requireCoach();
  if (formData.has("recordType"))
    return { error: "El tipo de registro es fijo. Crea otro ejercicio para cambiarlo." };
  let result: WriteResult;
  try {
    result = await updateExercise({ db: await createClient(), id, input: readInput(formData) });
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        "No se pudo confirmar el guardado. Tus datos siguen en el formulario; revisa la biblioteca antes de reintentar.",
    };
  }
  if (!result.ok) return { error: MESSAGES[result.reason] };
  revalidatePath("/coach/exercises");
  redirect("/coach/exercises");
}

export async function setExerciseArchivedAction(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  const db = await createClient();
  if (formData.get("archive") === "true") await archiveExercise({ db, id });
  else await restoreExercise({ db, id });
  revalidatePath("/coach/exercises");
}
