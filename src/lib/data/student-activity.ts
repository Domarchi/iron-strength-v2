// Actividad reciente de un alumno para su coach: últimos entrenamientos con series y comentarios.
// La RLS limita todo a los alumnos de este coach; si no se ve al alumno, devuelve null.
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, weekStartOf } from "../../domain/dates.ts";
import { getCheckin } from "./weekly-checkin";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export async function getStudentActivity(db: Client, studentId: string) {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id")
    .eq("id", studentId)
    .eq("role", "student")
    .maybeSingle();
  if (profileError) throw new Error("No se pudo leer al alumno.");
  if (!profile) return null;
  const [workouts, comments] = await Promise.all([
    db
      .from("workouts")
      .select("id, started_at, workout_sets(id)")
      .eq("student_id", studentId)
      .order("started_at", { ascending: false })
      .limit(10),
    db
      .from("comments")
      .select("id, workout_id, author_id, body, created_at, workouts!inner(student_id)")
      .eq("workouts.student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (workouts.error) throw new Error("No se pudo leer la actividad.");
  if (comments.error) throw new Error("No se pudieron leer los comentarios.");
  const weekStart = weekStartOf(new Date()),
    answers = await getCheckin(db, studentId, weekStart);
  return {
    version: 1 as const,
    checkin: answers ? { weekStart, answers } : null,
    workouts: workouts.data.map((w) => ({
      id: w.id,
      date: santiagoDate(new Date(w.started_at)),
      sets: w.workout_sets.length,
    })),
    comments: comments.data.map((c) => ({
      id: c.id,
      workoutId: c.workout_id,
      body: c.body,
      createdAt: new Date(c.created_at).toISOString(),
      authorKind: c.author_id === studentId ? ("student" as const) : ("coach" as const),
    })),
  };
}
