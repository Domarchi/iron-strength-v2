import type { WorkoutDraft } from "./draft";
import { buildPayload } from "./runner-state";
import { makeQueueEntry, type QueueEntry } from "@/lib/offline/queue-contract";

export function pendingWorkoutEntries(
  userId: string,
  queue: QueueEntry[],
  drafts: WorkoutDraft[],
  confirmed: string[],
  now: Date,
): QueueEntry[] {
  const rows = new Map<string, QueueEntry>();
  for (const entry of queue)
    if (entry.userId === userId && !confirmed.includes(entry.workoutId))
      rows.set(entry.workoutId, entry);
  for (const draft of drafts) {
    if (
      draft.userId !== userId ||
      draft.status !== "pending_save" ||
      rows.has(draft.workoutId) ||
      confirmed.includes(draft.workoutId)
    )
      continue;
    const built = buildPayload(draft, now);
    if (!built.ok)
      throw new Error(
        "Hay un registro local pendiente que no se pudo preparar. Conservamos su borrador.",
      );
    rows.set(draft.workoutId, makeQueueEntry(userId, built.payload, draft.updatedAt));
  }
  return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function finishExerciseOverview(draft: WorkoutDraft) {
  return draft.exercises.map((exercise) => ({
    name: exercise.name,
    completed: exercise.skipped ? 0 : exercise.sets.filter((s) => s.done).length,
    pending: exercise.skipped ? 0 : exercise.sets.filter((s) => !s.done).length,
    skipped: exercise.skipped,
  }));
}
