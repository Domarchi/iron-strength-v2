"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { markCommentsRead } from "@/lib/data/unread";
import { createClient } from "@/lib/supabase/server";

// Marca como leídos los comentarios de un entrenamiento (RF-37). Si el entrenamiento no es visible
// para quien llama, la base lo rechaza y no pasa nada.
export async function markReadAction(workoutId: string): Promise<void> {
  await requireUser();
  if (!z.uuid().safeParse(workoutId).success) return;
  const result = await markCommentsRead(await createClient(), workoutId);
  // Refresca contadores de la navegación y de las listas.
  if (result.ok) revalidatePath("/", "layout");
}
