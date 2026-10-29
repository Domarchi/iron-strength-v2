import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  coachSessionRequestSchema,
  coachSessionResultSchema,
  type CoachSessionResult,
} from "@/domain/coach-session-mutation";

export type CoachSessionMutationResult =
  | { ok: true; result: CoachSessionResult }
  | {
      ok: false;
      reason:
        | "invalid"
        | "conflict"
        | "week_locked"
        | "not_found"
        | "forbidden"
        | "unauthenticated"
        | "uncertain";
    };

/** Use the caller's authenticated client. Never regenerate an intent or refresh its base here. */
export async function mutateCoachSession(
  db: SupabaseClient<Database>,
  sessionId: string,
  input: unknown,
): Promise<CoachSessionMutationResult> {
  const request = coachSessionRequestSchema.safeParse(input);
  if (!request.success || !z.uuid().safeParse(sessionId).success)
    return { ok: false, reason: "invalid" };
  try {
    const response = await db.rpc("mutate_coach_session", {
      p_session_id: sessionId,
      p_request: request.data,
    });
    if (response.error) {
      const code = response.error.code;
      if (code === "40001") return { ok: false, reason: "conflict" };
      if (code === "55000") return { ok: false, reason: "week_locked" };
      if (code === "P0002") return { ok: false, reason: "not_found" };
      if (code === "42501") return { ok: false, reason: "forbidden" };
      if (["PGRST301", "PGRST302", "PGRST303"].includes(code))
        return { ok: false, reason: "unauthenticated" };
      if (["22023", "23514", "22P02", "23502", "23503", "22003", "23505"].includes(code))
        return { ok: false, reason: "invalid" };
      return { ok: false, reason: "uncertain" };
    }
    const result = coachSessionResultSchema.safeParse(response.data);
    if (
      !result.success ||
      result.data.id.toLowerCase() !== request.data.id.toLowerCase() ||
      result.data.sessionId.toLowerCase() !== sessionId.toLowerCase() ||
      result.data.revision < request.data.revision
    )
      return { ok: false, reason: "uncertain" };
    if (request.data.operation === "duplicate") {
      const expected = request.data.data;
      if (
        result.data.copyId?.toLowerCase() !== expected.copyId.toLowerCase() ||
        result.data.copyKind !== (expected.rowId === null ? "session" : "exercise")
      )
        return { ok: false, reason: "uncertain" };
    } else if (result.data.copyId !== undefined) return { ok: false, reason: "uncertain" };
    return { ok: true, result: result.data };
  } catch {
    // A network exception or an unrecognized response does not prove no commit.
    return { ok: false, reason: "uncertain" };
  }
}
