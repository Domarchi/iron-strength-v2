// Respuesta del coach a un comentario de un alumno desde el teléfono. Usa la RLS de comentarios
// (el coach puede escribir en entrenamientos de sus alumnos) y un ID elegido por el cliente para
// que repetir el envío tras perder la respuesta no cree dos mensajes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { commentSchema } from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type StudentReplyResult =
  | { ok: true; status: "created" | "duplicate" }
  | { ok: false; reason: "not_found" | "forbidden" | "conflict" };

export async function replyToStudentWorkout(
  db: Client,
  coachId: string,
  studentId: string,
  input: { workoutId: string; id: string; body: string },
): Promise<StudentReplyResult> {
  const parsed = commentSchema.safeParse({ body: input.body });
  if (!parsed.success) throw new Error("Mensaje inválido.");
  const workout = await db
    .from("workouts")
    .select("id")
    .eq("id", input.workoutId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (workout.error) throw new Error("No se pudo comprobar el entrenamiento.");
  if (!workout.data || studentId === coachId) return { ok: false, reason: "not_found" };
  const inserted = await db.from("comments").insert({
    id: input.id,
    workout_id: input.workoutId,
    author_id: coachId,
    body: parsed.data.body,
  });
  if (!inserted.error) return { ok: true, status: "created" };
  if (inserted.error.code === "42501") return { ok: false, reason: "forbidden" };
  if (inserted.error.code !== "23505") throw new Error("No se pudo publicar la respuesta.");
  const existing = await db
    .from("comments")
    .select("workout_id,author_id,body")
    .eq("id", input.id)
    .maybeSingle();
  if (existing.error) throw new Error("No se pudo comprobar la respuesta.");
  return existing.data &&
    existing.data.workout_id === input.workoutId &&
    existing.data.author_id === coachId &&
    existing.data.body === parsed.data.body
    ? { ok: true, status: "duplicate" }
    : { ok: false, reason: "conflict" };
}
