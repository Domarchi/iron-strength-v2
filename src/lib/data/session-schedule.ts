import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getWeekView } from "./week";
import { santiagoDate } from "@/domain/dates";
export async function moveSessionDay(
  db: SupabaseClient<Database>,
  studentId: string,
  sessionId: string,
  weekday: number | null,
): Promise<{ ok: boolean }> {
  if (
    !z.uuid().safeParse(sessionId).success ||
    !z.number().int().min(0).max(6).nullable().safeParse(weekday).success
  )
    return { ok: false };
  const view = await getWeekView(db, studentId, santiagoDate(new Date()));
  if (view.kind !== "active" || !view.sessions.some((s) => s.sessionId === sessionId))
    return { ok: false };
  const result =
    weekday === null
      ? await db
          .from("session_day_overrides")
          .delete()
          .eq("session_id", sessionId)
          .eq("student_id", studentId)
      : await db
          .from("session_day_overrides")
          .upsert(
            { session_id: sessionId, student_id: studentId, weekday },
            { onConflict: "session_id" },
          );
  return { ok: !result.error };
}
