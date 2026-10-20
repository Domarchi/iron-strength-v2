import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { validSupersetLayout } from "@/domain/supersets";
import { layoutRowSchema, type LayoutRequest } from "@/lib/coach/routine-layout";
import type { Result } from "./programs";
export async function configureSessionLayout(
  db: SupabaseClient<Database>,
  sessionId: string,
  request: LayoutRequest,
): Promise<Result<{ revision: number }>> {
  const parsed = z
    .object({
      id: z.uuid(),
      revision: z.number().int().nonnegative(),
      layout: z.array(layoutRowSchema).min(1).max(15),
    })
    .safeParse(request);
  if (
    !parsed.success ||
    !validSupersetLayout(parsed.data.layout.map((r) => ({ ...r, name: r.id })))
  )
    return { ok: false, reason: "invalid" };
  const { data, error } = await db.rpc("configure_session_layout", {
    p_session_id: sessionId,
    p_request_id: request.id,
    p_expected_revision: request.revision,
    p_layout: parsed.data.layout,
  });
  if (!error) return { ok: true, revision: data };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "40001") return { ok: false, reason: "conflict" };
  if (error.code === "55000") return { ok: false, reason: "week_locked" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (["22023", "23514", "22P02", "23502", "22003"].includes(error.code))
    return { ok: false, reason: "invalid" };
  throw new Error(error.message);
}
