import type { QueuedWorkoutPayload } from "../../../mobile/src/lib/queued-recording";
import {
  isRecordingPayload,
  isPersonalWorkoutPayload,
} from "../../../mobile/src/lib/personal-training";
import { personalWorkoutReceiptSchema } from "@/lib/mobile/personal-workout-contracts";
import type { SaveWorkoutResult } from "@/lib/data/save-workout";
type Payload3 = Extract<QueuedWorkoutPayload, { version: 3 }>;
type Payload2 = Extract<QueuedWorkoutPayload, { version: 2 }>;
type Payload1 = Extract<QueuedWorkoutPayload, { version: 1 }>;
type Payload0 = Exclude<QueuedWorkoutPayload, Payload3 | Payload2 | Payload1>;
export async function dispatchWebRecording(
  ops: {
    typed(p: Payload3): Promise<unknown>;
    recording(p: Payload2): Promise<unknown>;
    personal(p: Payload1): Promise<unknown>;
    legacy(p: Payload0): Promise<SaveWorkoutResult>;
    reconcile(workoutId: string): Promise<unknown>;
  },
  p: QueuedWorkoutPayload,
) {
  if (p.version === 3) return ops.typed(p); // Existing typed data wrapper owns achievement reconciliation.
  let value: unknown;
  if (isRecordingPayload(p)) value = await ops.recording(p);
  else if (isPersonalWorkoutPayload(p)) value = await ops.personal(p);
  else {
    const result = await ops.legacy(p);
    if (!result.ok)
      throw Object.assign(Error("Guardado rechazado"), {
        code: result.reason === "invalid" ? "invalid_input" : result.reason,
      });
    value = { workoutId: p.id, status: result.status };
  }
  const receipt = personalWorkoutReceiptSchema.parse(value);
  if (receipt.workoutId.toLowerCase() !== p.id.toLowerCase())
    throw Error("No se confirmó este entrenamiento.");
  if (receipt.status !== "removed") await ops.reconcile(p.id).catch(() => {});
  return receipt;
}
