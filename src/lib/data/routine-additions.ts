import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { additionRequestSchema, type AdditionRequest } from "@/lib/coach/routine-additions";
import type { Result } from "./programs";
export async function addRoutineExercises(
  db: SupabaseClient<Database>,
  sessionId: string,
  request: AdditionRequest,
): Promise<Result<{ revision: number }>> {
  const parsed = additionRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { data, error } = await db.rpc("add_routine_exercises", {
    p_session_id: sessionId,
    p_expected_revision: request.revision,
    p_request_id: request.id,
    p_items: parsed.data.items,
  });
  if (!error) return { ok: true, revision: data };
  if (error.code === "40001") return { ok: false, reason: "conflict" };
  if (error.code === "55000") return { ok: false, reason: "week_locked" };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (error.code === "23514") return { ok: false, reason: "limit" };
  if (["22023", "23505", "23503", "22P02", "23502", "22003"].includes(error.code))
    return { ok: false, reason: "invalid" };
  throw new Error(error.message);
}
