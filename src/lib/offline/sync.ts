import { activeOfflineAccount } from "./account";
import { syncResponseSchema, SYNC_MESSAGES, type SyncResult } from "./sync-contract";
import {
  enqueueWorkout,
  getQueuedWorkout,
  listQueuedWorkouts,
  notifyQueueChanged,
  removeConfirmedWorkout,
  setQueueError,
} from "./queue";
import type { WorkoutPayload } from "./queue-contract";
import { clearDraft, listDrafts } from "@/lib/workout/draft";
import { buildPayload } from "@/lib/workout/runner-state";

export async function sendWorkout(userId: string, payload: WorkoutPayload): Promise<SyncResult> {
  const active = activeOfflineAccount();
  if (active !== userId) return { ok: false, reason: "account_changed" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/workouts/sync", {
      method: "POST",
      signal: controller.signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, userId, payload }),
      cache: "no-store",
    });
    const parsed = syncResponseSchema.safeParse(await response.json());
    if (!parsed.success || (parsed.data.ok && !response.ok))
      return { ok: false, reason: "network" };
    return parsed.data;
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timeout);
  }
}
export function clearConfirmedDraft(userId: string, payload: WorkoutPayload) {
  try {
    clearDraft(localStorage, userId, payload.programSessionId, payload.id);
  } catch {
    /* La confirmación en la base permite reintentar la limpieza sin duplicar. */
  }
}
const syncing = new Map<string, Promise<SyncResult>>();
export function syncQueuedWorkout(
  userId: string,
  workoutId: string,
  fallback: WorkoutPayload,
): Promise<SyncResult> {
  const key = `${userId}:${workoutId}`;
  const previous = syncing.get(key);
  if (previous) return previous;
  const task = (async (): Promise<SyncResult> => {
    const entry =
      (await getQueuedWorkout(userId, workoutId)) ?? (await enqueueWorkout(userId, fallback));
    const result = await sendWorkout(userId, entry.payload);
    if (result.ok) {
      await removeConfirmedWorkout(userId, workoutId);
      clearConfirmedDraft(userId, entry.payload);
      notifyQueueChanged();
    } else await setQueueError(userId, workoutId, SYNC_MESSAGES[result.reason]);
    return result;
  })().finally(() => syncing.delete(key));
  syncing.set(key, task);
  return task;
}
// Incorporación compatible de pendientes anteriores, conservando su origen hasta confirmar.
export async function ingestPendingDrafts(userId: string): Promise<void> {
  let drafts;
  try {
    drafts = listDrafts(localStorage, userId);
  } catch {
    return;
  }
  for (const draft of drafts)
    if (draft.status === "pending_save") {
      const built = buildPayload(draft, new Date());
      if (built.ok) await enqueueWorkout(userId, built.payload);
    }
}
export async function syncAllWorkouts(userId: string): Promise<string[]> {
  const done: string[] = [];
  await ingestPendingDrafts(userId);
  for (const entry of await listQueuedWorkouts(userId)) {
    const result = await syncQueuedWorkout(userId, entry.workoutId, entry.payload);
    if (result.ok) done.push(entry.workoutId);
    else if (["network", "session_expired", "account_changed"].includes(result.reason)) break;
  }
  return done;
}
