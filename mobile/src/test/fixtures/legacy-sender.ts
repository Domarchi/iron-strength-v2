import type { NativeWorkoutPayload } from "../../lib/personal-training";
import type { QueuedWorkoutPayload } from "../../lib/queued-recording";
import { isTypedTraining, type CurrentTraining } from "../../lib/training";
/** Old-protocol fixtures explicitly cannot confirm document3. */
export function legacySender<T>(send: (payload: NativeWorkoutPayload) => Promise<T>) {
  return (payload: QueuedWorkoutPayload) => {
    if (payload.version === 3) throw Error("Este fixture anterior no confirma documento3.");
    return send(payload);
  };
}
export function legacyActive(active: CurrentTraining | null) {
  if (!active || isTypedTraining(active)) throw Error("Este caso requiere un registro anterior.");
  return active;
}
