import { offlineTransaction } from "./storage";
import { makeQueueEntry, parseQueueEntry, type QueueEntry } from "./queue-contract";
export function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("offline-queue"));
}
export async function enqueueWorkout(userId: string, payload: unknown): Promise<QueueEntry> {
  const entry = makeQueueEntry(userId, payload, new Date().toISOString());
  const saved = await offlineTransaction<QueueEntry>(
    "readwrite",
    (store, result) => {
      const request = store.get([userId, entry.workoutId]);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          const existing = parseQueueEntry(request.result, userId);
          if (!existing) {
            store.transaction.abort();
            return;
          }
          // El primer contenido confirmado queda congelado; un reintento nunca lo reemplaza.
          result(existing);
          return;
        }
        const put = store.add(entry);
        put.onsuccess = () => result(entry);
      };
    },
    "queue",
  );
  notifyQueueChanged();
  return saved;
}
export async function listQueuedWorkouts(userId: string): Promise<QueueEntry[]> {
  return offlineTransaction(
    "readonly",
    (store, result) => {
      const request = store.index("userId").getAll(userId);
      request.onsuccess = () => {
        const entries = (request.result as unknown[]).map((e) => parseQueueEntry(e, userId));
        if (entries.some((e) => !e)) {
          store.transaction.abort();
          return;
        }
        result(
          (entries as QueueEntry[]).sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) || a.workoutId.localeCompare(b.workoutId),
          ),
        );
      };
    },
    "queue",
  );
}
export async function getQueuedWorkout(
  userId: string,
  workoutId: string,
): Promise<QueueEntry | null> {
  return offlineTransaction(
    "readonly",
    (store, result) => {
      const request = store.get([userId, workoutId]);
      request.onsuccess = () => {
        if (request.result === undefined) return result(null);
        const entry = parseQueueEntry(request.result, userId);
        if (!entry) {
          store.transaction.abort();
          return;
        }
        result(entry);
      };
    },
    "queue",
  );
}
export async function setQueueError(
  userId: string,
  workoutId: string,
  error: string,
): Promise<void> {
  await offlineTransaction<void>(
    "readwrite",
    (store, result) => {
      const request = store.get([userId, workoutId]);
      request.onsuccess = () => {
        if (request.result === undefined) return result();
        const entry = parseQueueEntry(request.result, userId);
        if (!entry) {
          store.transaction.abort();
          return;
        }
        const put = store.put({ ...entry, error });
        put.onsuccess = () => result();
      };
    },
    "queue",
  );
  notifyQueueChanged();
}
export async function removeConfirmedWorkout(userId: string, workoutId: string): Promise<void> {
  await offlineTransaction<void>(
    "readwrite",
    (store, result) => {
      const request = store.delete([userId, workoutId]);
      request.onsuccess = () => result();
    },
    "queue",
  );
  notifyQueueChanged();
}
