import { z } from "zod";
import {
  typedRecordingPayloadSchema,
  typedRecordingSaveSchema,
  type TypedRecordingPayload,
} from "../../../src/lib/mobile/typed-recording-contracts";
import { recordingSaveSchema } from "../../../src/lib/mobile/recording-contracts";
import { mobileSaveSchema } from "../../../src/lib/mobile/contracts";
import {
  nativeWorkoutPayloadSchema,
  isRecordingPayload,
  isPersonalWorkoutPayload,
} from "./personal-training";
import type { MobileClient } from "./client";

// Keep the active-session parsers and old queue formats closed to document3.
export const queuedWorkoutPayloadSchema = z.union([
  typedRecordingPayloadSchema,
  nativeWorkoutPayloadSchema,
]);
export type QueuedWorkoutPayload = z.infer<typeof queuedWorkoutPayloadSchema>;
export type QueuedSaveReply = {
  version: 1 | 2 | 3;
  ok: true;
  status: "created" | "duplicate";
  workoutId: string;
};
export const isTypedRecording = (p: QueuedWorkoutPayload): p is TypedRecordingPayload =>
  p.version === 3;
export const queuedPayloadBody = (p: QueuedWorkoutPayload) =>
  isTypedRecording(p) || isRecordingPayload(p) ? p.workout : p;
export const queuedReceiptSchema = (p: QueuedWorkoutPayload) =>
  isTypedRecording(p)
    ? typedRecordingSaveSchema
    : isRecordingPayload(p)
      ? recordingSaveSchema
      : mobileSaveSchema;
export function sendQueuedRecording(
  client: Pick<
    MobileClient,
    "saveTypedRecording" | "saveRecording" | "savePersonalWorkout" | "saveWorkout"
  >,
  p: QueuedWorkoutPayload,
  userId: string,
): Promise<QueuedSaveReply> {
  return isTypedRecording(p)
    ? client.saveTypedRecording(p, userId)
    : isRecordingPayload(p)
      ? client.saveRecording(p, userId)
      : isPersonalWorkoutPayload(p)
        ? client.savePersonalWorkout(p, userId)
        : client.saveWorkout(p, userId);
}
