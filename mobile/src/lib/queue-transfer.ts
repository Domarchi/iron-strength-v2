import type { TrainingController } from "./training";
import type { NativeWorkoutQueue } from "./sync-queue";
/** The source is retired only after atomic write and readback confirm the complete queue entry. */
export async function handoffPending(source: TrainingController, queue: NativeWorkoutQueue) {
  const epoch = queue.generation();
  const pending = await source.pendingForQueue();
  if (!pending) return null;
  const entry = await queue.enqueue(pending);
  if (!queue.isCurrent(epoch))
    throw Error("La cuenta cambió. Conservamos el cierre original y su copia.");
  await source.releaseQueued(pending.payload.id, pending.payload);
  return entry;
}
