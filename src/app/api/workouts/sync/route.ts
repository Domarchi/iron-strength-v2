import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { saveWorkout, workoutPayloadSchema } from "@/lib/data/save-workout";
import { syncAchievements } from "@/lib/data/achievements";
import type { SyncResult } from "@/lib/offline/sync-contract";
const requestSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  payload: workoutPayloadSchema,
});
const respond = (body: SyncResult, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return respond({ ok: false, reason: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return respond({ ok: false, reason: "invalid" }, 400);
  try {
    const user = await getCurrentUser();
    if (!user) return respond({ ok: false, reason: "session_expired" }, 401);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return respond({ ok: false, reason: "invalid" }, 400);
    if (parsed.data.userId !== user.id)
      return respond({ ok: false, reason: "account_changed" }, 403);
    const db = await createClient();
    const result = await saveWorkout({ db, payload: parsed.data.payload });
    if (!result.ok) return respond(result, 422);
    revalidatePath("/week");
    revalidatePath("/history");
    const achievements = await syncAchievements({
      db,
      studentId: user.id,
      workoutId: parsed.data.payload.id,
    }).catch(() => []);
    return respond({ ...result, achievements });
  } catch {
    return respond({ ok: false, reason: "network" }, 503);
  }
}
