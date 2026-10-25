import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database";
import { commentSchema } from "../../domain/schemas";
import { listUnread } from "./unread";
type Client = SupabaseClient<Database>;
const cursorSchema = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);
export function parseCommentCursor(value: string) {
  if (value.length > 100) return null;
  const parsed = cursorSchema.safeParse(value.split("|"));
  return parsed.success ? { at: parsed.data[0], id: parsed.data[1] } : null;
}
async function owns(db: Client, userId: string, workoutId: string) {
  const r = await db
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("student_id", userId)
    .maybeSingle();
  if (r.error) throw Error("No pudimos comprobar el entrenamiento.");
  return !!r.data;
}
export async function listOwnComments(
  db: Client,
  userId: string,
  workoutId: string,
  cursor?: string,
) {
  if (!(await owns(db, userId, workoutId))) return null;
  let q = db
    .from("comments")
    .select("id,author_id,body,created_at")
    .eq("workout_id", workoutId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor) {
    const parsed = parseCommentCursor(cursor);
    if (!parsed) throw Error("Cursor inválido");
    q = q.or(`created_at.lt.${parsed.at},and(created_at.eq.${parsed.at},id.lt.${parsed.id})`);
  }
  const [result, unread] = await Promise.all([q, listUnread(db)]);
  if (result.error) throw Error("No pudimos cargar los comentarios.");
  const rows = result.data.slice(0, 50),
    last = rows.at(-1);
  return {
    items: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      authorKind: c.author_id === userId ? ("student" as const) : ("coach" as const),
      mine: c.author_id === userId,
    })),
    nextCursor: result.data.length > 50 && last ? last.created_at + "|" + last.id : null,
    unreadCount:
      unread.find((r) => r.workoutId === workoutId && r.studentId === userId)?.count ?? 0,
  };
}
export type CommentWriteResult =
  | { ok: true; id: string; status: "created" | "duplicate" }
  | { ok: false; reason: "invalid" | "not_found" | "forbidden" | "conflict" | "removed" };
export async function publishOwnComment(
  db: Client,
  userId: string,
  workoutId: string,
  input: { id: string; body: string },
): Promise<CommentWriteResult> {
  const parsed = commentSchema.safeParse({ body: input.body });
  if (!parsed.success || !z.uuid().safeParse(input.id).success)
    return { ok: false, reason: "invalid" };
  if (!(await owns(db, userId, workoutId))) return { ok: false, reason: "not_found" };
  const result = await db.rpc("publish_mobile_comment", {
    p_comment_id: input.id,
    p_workout_id: workoutId,
    p_body: parsed.data.body,
  });
  if (result.error?.code === "42501") return { ok: false, reason: "forbidden" };
  if (!result.error) {
    if (result.data === "created" || result.data === "duplicate")
      return { ok: true, status: result.data, id: input.id };
    if (
      result.data === "invalid" ||
      result.data === "not_found" ||
      result.data === "forbidden" ||
      result.data === "conflict" ||
      result.data === "removed"
    )
      return { ok: false, reason: result.data };
  }
  throw Error("No pudimos confirmar la publicación. Conservamos tu mensaje para reintentar.");
}
export type CommentDeleteResult =
  { ok: true; status: "deleted" | "absent" } | { ok: false; reason: "not_found" | "forbidden" };
export async function removeOwnComment(
  db: Client,
  userId: string,
  workoutId: string,
  id: string,
): Promise<CommentDeleteResult> {
  if (!(await owns(db, userId, workoutId))) return { ok: false, reason: "not_found" };
  const existing = await db
    .from("comments")
    .select("id,author_id")
    .eq("id", id)
    .eq("workout_id", workoutId)
    .maybeSingle();
  if (existing.error) throw Error("No pudimos comprobar el comentario.");
  if (!existing.data) return { ok: true, status: "absent" };
  if (existing.data.author_id !== userId) return { ok: false, reason: "forbidden" };
  const result = await db
    .from("comments")
    .delete()
    .eq("id", id)
    .eq("workout_id", workoutId)
    .eq("author_id", userId);
  if (result.error) throw Error("No pudimos confirmar el borrado del comentario.");
  return { ok: true, status: "deleted" };
}
export { owns as ownsMobileWorkout };
