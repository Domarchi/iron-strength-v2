import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { readMobileBody } from "@/lib/mobile/api";
import { personalWorkoutReceiptSchema } from "@/lib/mobile/personal-workout-contracts";
import {
  queuedWorkoutPayloadSchema,
  queuedReceiptSchema,
  type QueuedWorkoutPayload,
} from "../../../mobile/src/lib/queued-recording";
const input = z.strictObject({
  version: z.literal(1),
  userId: z.uuid().transform((v) => v.toLowerCase()),
  payload: queuedWorkoutPayloadSchema,
});
import { webSyncErrors as errors, type WebSyncCode as Code } from "./web-sync-contract";
const codes = new Map<string, Code>([
  ["40001", "conflict"],
  ["23505", "conflict"],
  ["42501", "forbidden"],
  ["P0002", "not_found"],
  ...["22023", "22P02", "23514", "23502", "23503", "22003", "P0001"].map(
    (c) => [c, "invalid_input"] as [string, Code],
  ),
  ...Object.keys(errors).map((c) => [c, c] as [string, Code]),
]);
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function failure(code: Code) {
  return json({ version: 1, error: { code, message: errors[code][1] } }, errors[code][0]);
}
export function createWebTrainingSync(deps: {
  authorize(): Promise<{
    userId: string;
    save(payload: QueuedWorkoutPayload): Promise<unknown>;
  } | null>;
}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) return failure("forbidden");
    if (
      new URL(request.url).search ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")
    )
      return failure("invalid_input");
    try {
      const actor = await deps.authorize();
      if (!actor) return failure("unauthorized");
      const body = await readMobileBody(request, 262144);
      if (!body.ok)
        return json(
          { version: 1, error: { code: "invalid_input", message: errors.invalid_input[1] } },
          body.response.status,
        );
      const parsed = input.safeParse(body.value);
      if (!parsed.success) return failure("invalid_input");
      if (actor.userId.toLowerCase() !== parsed.data.userId) return failure("account_changed");
      const p = parsed.data.payload;
      const receipt = personalWorkoutReceiptSchema.safeParse(await actor.save(p));
      if (!receipt.success || receipt.data.workoutId.toLowerCase() !== p.id.toLowerCase())
        return failure("unavailable");
      if (receipt.data.status === "removed") return failure("removed");
      // Keep the literal legacy UUID case and payload version; never migrate an in-flight request.
      const reply = queuedReceiptSchema(p).safeParse({
        version: p.version ?? 1,
        ok: true,
        status: receipt.data.status,
        workoutId: p.id,
      });
      if (!reply.success) return failure("unavailable");
      return json(reply.data);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      return failure(codes.get(code) ?? "unavailable");
    }
  };
}
