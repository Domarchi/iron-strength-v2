import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  alternativeRequestSchema,
  type AlternativeRequest,
} from "@/lib/coach/routine-alternatives";
import type { Result } from "./programs";
export async function configureAlternatives(
  db: SupabaseClient<Database>,
  sessionId: string,
  request: AlternativeRequest,
): Promise<Result<{ revision: number }>> {
  const parsed = alternativeRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { data, error } = await db.rpc("configure_session_alternatives", {
    p_session_id: sessionId,
    p_exercise_row_id: request.exerciseRowId,
    p_request_id: request.id,
    p_expected_revision: request.revision,
    p_alternatives: parsed.data.alternatives,
  });
  if (!error) return { ok: true, revision: data };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "40001") return { ok: false, reason: "conflict" };
  if (error.code === "55000") return { ok: false, reason: "week_locked" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (["22023", "23514", "23505", "23503", "22P02", "23502", "22003"].includes(error.code))
    return { ok: false, reason: "invalid" };
  throw new Error(error.message);
}
