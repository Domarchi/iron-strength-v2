// Check-in semanal alumno → coach (T256). La RLS decide quién lee y escribe; aquí solo se arma la consulta.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import type { DateString } from "../../domain/dates";

type Client = SupabaseClient<Database>;
export type CheckinAnswers = {
  sleep: number;
  energy: number;
  soreness: number;
  motivation: number;
  note: string | null;
};

export async function getCheckin(
  db: Client,
  studentId: string,
  weekStart: DateString,
): Promise<CheckinAnswers | null> {
  const { data, error } = await db
    .from("weekly_checkins")
    .select("sleep,energy,soreness,motivation,note")
    .eq("student_id", studentId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error("No se pudo leer el check-in");
  return data;
}

/** Crea o corrige el check-in de la semana: repetir el envío deja un solo registro. */
export async function saveCheckin(
  db: Client,
  studentId: string,
  weekStart: DateString,
  answers: CheckinAnswers,
): Promise<void> {
  const { error } = await db
    .from("weekly_checkins")
    .upsert(
      { student_id: studentId, week_start: weekStart, ...answers },
      { onConflict: "student_id,week_start" },
    );
  if (error) throw new Error("No se pudo guardar el check-in");
}

/** Último check-in de un alumno (para la vista del coach). */
export async function latestCheckin(db: Client, studentId: string) {
  const { data, error } = await db
    .from("weekly_checkins")
    .select("week_start,sleep,energy,soreness,motivation,note,updated_at")
    .eq("student_id", studentId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("No se pudo leer el check-in");
  return data;
}
