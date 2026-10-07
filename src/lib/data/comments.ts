// Comentarios por entrenamiento (RF-36, DC-14): hasta 500 caracteres, los escriben el alumno y su
// coach, cada autor borra solo los suyos y no se editan. La RLS decide quién ve y quién escribe.
// Un alumno no puede leer el nombre de su coach (RLS de profiles), así que el autor se rotula por su
// papel: "student" si escribió el dueño del entrenamiento y "coach" en cualquier otro caso.
import type { SupabaseClient } from "@supabase/supabase-js";
import { commentSchema } from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  authorKind: "student" | "coach";
  mine: boolean;
};

export async function listComments(args: {
  db: Client;
  workoutId: string;
  viewerId: string;
  studentId: string; // dueño del entrenamiento
}): Promise<CommentItem[]> {
  const { data, error } = await args.db
    .from("comments")
    .select("id, author_id, body, created_at")
    .eq("workout_id", args.workoutId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar los comentarios: ${error.message}`);

  return data.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    authorKind: c.author_id === args.studentId ? "student" : "coach",
    mine: c.author_id === args.viewerId,
  }));
}

export async function addComment(args: {
  db: Client;
  workoutId: string;
  body: string;
}): Promise<
  { ok: true; id: string } | { ok: false; reason: "invalid" | "not_found" | "forbidden" }
> {
  const parsed = commentSchema.safeParse({ body: args.body });
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const { data: user } = await args.db.auth.getUser();
  if (!user.user) return { ok: false, reason: "forbidden" };

  // Si la RLS no deja ver el entrenamiento, para este usuario "no existe".
  const { data: workout } = await args.db
    .from("workouts")
    .select("id")
    .eq("id", args.workoutId)
    .maybeSingle();
  if (!workout) return { ok: false, reason: "not_found" };

  const { data, error } = await args.db
    .from("comments")
    .insert({ workout_id: args.workoutId, author_id: user.user.id, body: parsed.data.body })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    throw new Error(`No se pudo publicar el comentario: ${error.message}`);
  }
  return { ok: true, id: data.id };
}

export async function deleteComment(args: {
  db: Client;
  id: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const { data, error } = await args.db
    .from("comments")
    .delete()
    .eq("id", args.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo borrar el comentario: ${error.message}`);
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}
