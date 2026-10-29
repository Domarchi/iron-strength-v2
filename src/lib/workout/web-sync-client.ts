import { z } from "zod";
import {
  queuedWorkoutPayloadSchema,
  queuedReceiptSchema,
  type QueuedWorkoutPayload,
  type QueuedSaveReply,
} from "../../../mobile/src/lib/queued-recording";
import { webSyncErrors, type WebSyncCode as Code } from "./web-sync-contract";
export class WebSyncError extends Error {
  constructor(
    readonly code: Code,
    readonly status: number,
  ) {
    super(webSyncErrors[code][1]);
  }
}
export async function sendWebTraining(
  userId: string,
  payload: QueuedWorkoutPayload,
  transport: typeof fetch = fetch,
): Promise<QueuedSaveReply> {
  if (!z.uuid().safeParse(userId).success || !queuedWorkoutPayloadSchema.safeParse(payload).success)
    throw new WebSyncError("invalid_input", 400);
  let response: Response;
  try {
    response = await transport("/api/workouts/training-sync", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, userId, payload }),
    });
  } catch {
    throw new WebSyncError("unavailable", 503);
  }
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      raw &&
      typeof raw === "object" &&
      "version" in raw &&
      raw.version === 1 &&
      "error" in raw &&
      raw.error &&
      typeof raw.error === "object" &&
      "code" in raw.error &&
      typeof raw.error.code === "string" &&
      Object.hasOwn(webSyncErrors, raw.error.code)
        ? (raw.error.code as Code)
        : "unavailable";
    throw new WebSyncError(code, code === "unavailable" ? 503 : response.status);
  }
  const result = queuedReceiptSchema(payload).safeParse(raw);
  if (!result.success || result.data.workoutId.toLowerCase() !== payload.id.toLowerCase())
    throw new WebSyncError("unavailable", 503);
  return { ...result.data, workoutId: payload.id };
}
