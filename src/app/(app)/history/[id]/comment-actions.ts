"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { addComment, deleteComment } from "@/lib/data/comments";
import { createClient } from "@/lib/supabase/server";

export type CommentState = { error: string | null; posted?: number };

export async function addCommentAction(
  workoutId: string,
  prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  await requireUser();
  const result = await addComment({
    db: await createClient(),
    workoutId,
    body: String(formData.get("body") ?? ""),
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "invalid"
          ? "Escribe un comentario de hasta 500 caracteres."
          : "No se pudo publicar el comentario. Recarga la página e inténtalo de nuevo.",
      posted: prev.posted,
    };
  }
  revalidatePath(`/history/${workoutId}`);
  return { error: null, posted: (prev.posted ?? 0) + 1 };
}

export async function deleteCommentAction(workoutId: string, formData: FormData): Promise<void> {
  await requireUser();
  await deleteComment({ db: await createClient(), id: String(formData.get("id") ?? "") });
  revalidatePath(`/history/${workoutId}`);
}
