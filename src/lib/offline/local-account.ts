import { clearEditorViews, editorViewStorage } from "@/lib/coach/editor-view";
import type { DraftStorage } from "@/lib/workout/draft";
import { offlineTransaction } from "./storage";
import { listQueuedWorkouts, notifyQueueChanged } from "./queue";
export function accountStorageKeys(storage: DraftStorage, userId: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    const parts = key.split(":");
    if (
      parts[0] === "is" &&
      ["draft", "coach-draft", "program-copy", "planning-request", "workout-focus"].includes(
        parts[1],
      ) &&
      parts[3] === userId
    )
      keys.push(key);
  }
  return keys;
}
export function hasLocalTraining(storage: DraftStorage): boolean {
  for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith("is:draft:")) return true;
  return false;
}
export async function inspectLocalAccount(userId: string) {
  const keys = accountStorageKeys(localStorage, userId).filter(
    (key) => !key.startsWith("is:workout-focus:"),
  );
  const queue = await listQueuedWorkouts(userId);
  return { keys: keys.length, queued: queue.length, pending: keys.length > 0 || queue.length > 0 };
}
export async function clearLocalAccount(userId: string): Promise<void> {
  for (const storeName of ["queue", "weeks"] as const)
    await offlineTransaction<void>(
      "readwrite",
      (store, done) => {
        const request = store.index("userId").openCursor(IDBKeyRange.only(userId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            done();
            return;
          }
          cursor.delete();
          cursor.continue();
        };
      },
      storeName,
    );
  for (const key of accountStorageKeys(localStorage, userId)) localStorage.removeItem(key);
  if (accountStorageKeys(localStorage, userId).length)
    throw new Error("No se pudieron eliminar todos los borradores locales.");
  clearEditorViews(editorViewStorage(), userId);
  notifyQueueChanged();
}
