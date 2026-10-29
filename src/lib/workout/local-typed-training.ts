import { trainingEnvelopeSchema, isTypedTraining } from "../../../mobile/src/lib/training";
import { workoutQueueEnvelopeSchema } from "../../../mobile/src/lib/sync-queue";
type Reader = Pick<Storage, "getItem">;
export function localAssignedTrainings(storage: Reader, userId: string) {
  const rows: { sessionId: string; workoutId: string; phase: "in_progress" | "pending_save" }[] =
    [];
  try {
    const raw = storage.getItem(`is:native-training:v1:${userId}`),
      source = raw ? trainingEnvelopeSchema.safeParse(JSON.parse(raw)) : null;
    const a = source?.success && source.data.userId === userId ? source.data.active : null;
    if (
      a &&
      a.draft.userId === userId &&
      isTypedTraining(a) &&
      a.routine.origin.kind === "assigned"
    )
      rows.push({
        sessionId: a.routine.origin.programSessionId,
        workoutId: a.draft.workoutId,
        phase: a.draft.status,
      });
    const queued = storage.getItem(`is:native-sync:v1:${userId}`),
      queue = queued ? workoutQueueEnvelopeSchema.safeParse(JSON.parse(queued)) : null;
    if (queue?.success && queue.data.userId === userId)
      for (const e of queue.data.entries) {
        if (
          e.phase === "pending" &&
          "source" in e.payload &&
          e.payload.source === "assigned" &&
          !rows.some((r) => r.workoutId === e.payload.id)
        )
          rows.push({
            sessionId: e.payload.workout.programSessionId,
            workoutId: e.payload.id,
            phase: "pending_save",
          });
      }
  } catch {
    /* Unknown bytes stay untouched. The account provider shows the recovery error. */
  }
  return rows;
}
