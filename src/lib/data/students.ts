// Resumen de los alumnos para el panel del coach (RF-33, DC-22): última actividad, cumplimiento
// de la semana en curso y último comentario. La RLS limita todo a los alumnos de este coach, y el
// propio coach (que entrena como un alumno más) no aparece aquí: tiene su sección "Mi entreno".
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import type { Database } from "../../types/database.ts";
import { getWeekView } from "./week";

type Client = SupabaseClient<Database>;

export type WeekSummary =
  | { kind: "no_program" }
  | { kind: "scheduled" | "finished"; programName: string }
  | {
      kind: "active";
      programName: string;
      programId?: string;
      startDate?: DateString;
      endsOn?: DateString;
      weekNumber: number;
      planned: number;
      done: number;
      deload: boolean;
    };

export type StudentOverview = {
  id: string;
  fullName: string;
  isActive: boolean;
  lastWorkoutDate: DateString | null;
  lastWorkoutId?: string | null;
  lastCommentAt: string | null;
  week: WeekSummary;
};

export async function listStudentOverviews(
  db: Client,
  today: DateString,
): Promise<StudentOverview[]> {
  const { data: students, error } = await db
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("role", "student")
    .order("full_name");
  if (error) throw new Error(`No se pudieron cargar los alumnos: ${error.message}`);

  return Promise.all(
    students.map(async (student) => {
      const [lastWorkout, lastComment, view] = await Promise.all([
        db
          .from("workouts")
          .select("id, started_at, workout_sets!inner(id)")
          .eq("student_id", student.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("comments")
          .select("created_at, workouts!inner(student_id)")
          .eq("workouts.student_id", student.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        getWeekView(db, student.id, today),
      ]);
      if (lastWorkout.error)
        throw new Error(`No se pudo leer la actividad: ${lastWorkout.error.message}`);
      if (lastComment.error)
        throw new Error(`No se pudo leer los comentarios: ${lastComment.error.message}`);

      const week: WeekSummary =
        view.kind === "no_program"
          ? { kind: "no_program" }
          : view.kind === "active"
            ? {
                kind: "active",
                programName: view.program.name,
                programId: view.program.id,
                startDate: view.program.startDate,
                endsOn: view.program.endsOn,
                weekNumber: view.weekNumber,
                planned: view.compliance.planned,
                done: view.compliance.done,
                deload: view.compliance.deload,
              }
            : { kind: view.kind, programName: view.program.name };

      return {
        id: student.id,
        fullName: student.full_name,
        isActive: student.is_active,
        lastWorkoutId: lastWorkout.data?.id ?? null,
        lastWorkoutDate: lastWorkout.data
          ? santiagoDate(new Date(lastWorkout.data.started_at))
          : null,
        lastCommentAt: lastComment.data?.created_at ?? null,
        week,
      };
    }),
  );
}
