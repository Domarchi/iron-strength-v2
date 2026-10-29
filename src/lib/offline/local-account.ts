import { workoutCorrectionDraftSchema } from "@/lib/workout/correction-draft";
import { workoutRemovalDraftSchema } from "@/lib/workout/removal-draft";
import { clearEditorViews, editorViewStorage } from "@/lib/coach/editor-view";
import type { DraftStorage } from "@/lib/workout/draft";
import { offlineTransaction } from "./storage";
import { listQueuedWorkouts, notifyQueueChanged } from "./queue";
import { trainingEnvelopeSchema } from "../../../mobile/src/lib/training";
import { workoutQueueEnvelopeSchema } from "../../../mobile/src/lib/sync-queue";
export function typedTrainingPending(key: string, raw: string | null, userId: string): boolean {
  if (raw === null) return false;
  const parts = key.split(":");
  if (parts.length !== 4 || parts[2] !== "v1" || parts[3] !== userId) return true;
  try {
    if (parts[1] === "native-training") {
      const value = trainingEnvelopeSchema.parse(JSON.parse(raw));
      return value.userId !== userId || !!value.active;
    }
    const value = workoutQueueEnvelopeSchema.parse(JSON.parse(raw));
    return value.userId !== userId || value.entries.some((e) => e.phase === "pending");
  } catch {
    return true;
  }
}
const isTypedTrainingKey = (key: string) =>
  key.startsWith("is:native-training:") || key.startsWith("is:native-sync:");
export function accountStorageKeys(storage: DraftStorage, userId: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    const parts = key.split(":");
    if (
      parts[0] === "is" &&
      [
        "draft",
        "coach-draft",
        "program-copy",
        "planning-request",
        "workout-focus",
        "workout-correction",
        "workout-removal",
        "native-training",
        "native-sync",
      ].includes(parts[1]) &&
      parts[3] === userId
    )
      keys.push(key);
  }
  return keys;
}
export function hasLocalTraining(storage: DraftStorage): boolean {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("is:draft:")) return true;
    if (
      key &&
      isTypedTrainingKey(key) &&
      typedTrainingPending(key, storage.getItem(key), key.split(":")[3] ?? "")
    )
      return true;
  }
  return false;
}
function isWorkoutChangeKey(key: string) {
  return key.startsWith("is:workout-correction:") || key.startsWith("is:workout-removal:");
}
/** Unknown versions and incoherent bytes remain pending; a read-only snapshot does not. */
export function workoutChangePending(key: string, raw: string | null, userId: string): boolean {
  if (raw === null) return false;
  const parts = key.split(":");
  if (parts.length !== 4 || parts[2] !== "v1" || parts[3] !== userId) return true;
  try {
    const value: unknown = JSON.parse(raw);
    if (parts[1] === "workout-correction") {
      const parsed = workoutCorrectionDraftSchema.safeParse(value);
      return (
        !parsed.success ||
        parsed.data.userId !== userId ||
        !!(parsed.data.draft?.changed || parsed.data.pending)
      );
    }
    const parsed = workoutRemovalDraftSchema.safeParse(value);
    return !parsed.success || parsed.data.userId !== userId || !!parsed.data.pending;
  } catch {
    return true;
  }
}
export async function inspectLocalAccount(userId: string) {
  const keys = accountStorageKeys(localStorage, userId).filter(
    (key) =>
      !key.startsWith("is:workout-focus:") &&
      (!isTypedTrainingKey(key) || typedTrainingPending(key, localStorage.getItem(key), userId)) &&
      (!isWorkoutChangeKey(key) || workoutChangePending(key, localStorage.getItem(key), userId)),
  );
  const queue = await listQueuedWorkouts(userId);
  return { keys: keys.length, queued: queue.length, pending: keys.length > 0 || queue.length > 0 };
}
export async function clearLocalAccount(
  userId: string,
  options: { afterAccountDeletion?: boolean } = {},
): Promise<void> {
  const typedBefore = new Map(
    accountStorageKeys(localStorage, userId)
      .filter(isTypedTrainingKey)
      .map((key) => [key, localStorage.getItem(key)]),
  );
  if (
    !options.afterAccountDeletion &&
    [...typedBefore].some(([key, raw]) => typedTrainingPending(key, raw, userId))
  )
    throw Error(
      "Retoma, sincroniza o descarta explícitamente el registro pendiente antes de salir.",
    );
  if (
    !options.afterAccountDeletion &&
    accountStorageKeys(localStorage, userId).some(
      (key) =>
        isWorkoutChangeKey(key) && workoutChangePending(key, localStorage.getItem(key), userId),
    )
  )
    throw Error(
      "Revisa las correcciones o eliminaciones pendientes antes de salir. Conservamos sus datos.",
    );
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
  for (const key of accountStorageKeys(localStorage, userId).sort(
    (a, b) => Number(isTypedTrainingKey(b)) - Number(isTypedTrainingKey(a)),
  )) {
    if (isTypedTrainingKey(key)) {
      const before = typedBefore.get(key);
      if (before === undefined || !navigator.locks)
        throw Error("El registro cambió. Conservamos sus datos.");
      await navigator.locks.request("iron-strength-native-week:" + key, () => {
        if (localStorage.getItem(key) !== before)
          throw Error("El registro cambió en otra ventana.");
        localStorage.removeItem(key);
        if (localStorage.getItem(key) !== null) throw Error("No se confirmó la limpieza local.");
      });
      continue;
    }
    if (!isWorkoutChangeKey(key)) {
      localStorage.removeItem(key);
      continue;
    }
    const before = localStorage.getItem(key);
    if (!options.afterAccountDeletion && workoutChangePending(key, before, userId))
      throw Error("La propuesta cambió en otra ventana. Conservamos sus datos.");
    if (!navigator.locks)
      throw Error("No se pudo reservar la limpieza local. Conservamos los datos.");
    await navigator.locks.request("iron-strength-native-week:" + key, () => {
      if (localStorage.getItem(key) !== before)
        throw Error("La propuesta cambió en otra ventana. Conservamos sus datos.");
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null) throw Error("No se confirmó la limpieza local.");
    });
  }
  if (accountStorageKeys(localStorage, userId).length)
    throw new Error("No se pudieron eliminar todos los borradores locales.");
  clearEditorViews(editorViewStorage(), userId);
  notifyQueueChanged();
}
