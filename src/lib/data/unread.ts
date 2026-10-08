// Comentarios no leídos (RF-37; DC-30). Las funciones de la base se ejecutan con los permisos de
// quien llama: la RLS de comments y workouts decide qué puede ver cada uno.
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeUnread, type UnreadRow, type UnreadSummary } from "../../domain/unread.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export async function listUnread(db: Client): Promise<UnreadRow[]> {
  const { data, error } = await db.rpc("unread_comments");
  if (error) throw new Error(`No se pudieron cargar los comentarios sin leer: ${error.message}`);
  return data.map((r) => ({
    workoutId: r.workout_id,
    studentId: r.student_id,
    count: r.unread_count,
    lastCommentAt: r.last_comment_at,
  }));
}

export async function getUnreadSummary(db: Client): Promise<UnreadSummary> {
  return summarizeUnread(await listUnread(db));
}

// Marca como leído un entrenamiento que quien llama puede ver. Un entrenamiento ajeno es un error
// de permisos y no deja rastro.
export async function markCommentsRead(
  db: Client,
  workoutId: string,
): Promise<{ ok: true } | { ok: false }> {
  const { error } = await db.rpc("mark_comments_read", { p_workout_id: workoutId });
  return error ? { ok: false } : { ok: true };
}
