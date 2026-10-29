import { z } from "zod";
import { trainingEnvelopeSchema, type TrainingStorage } from "../../../mobile/src/lib/training";
import { workoutQueueEnvelopeSchema } from "../../../mobile/src/lib/sync-queue";
import { AtomicStoreError } from "../../../mobile/src/lib/atomic-contract";
import { hasPreviousTraining, trainingGuardKey } from "./training-guard";
import type { DraftStorage } from "./draft";
type Locks = { request(name: string, operation: () => void | Promise<void>): Promise<unknown> };
export const trainingAccountLock = (userId: string) => "iron-strength-web-training:" + userId;
export async function reserveTrainingAccount(userId: string): Promise<() => void> {
  if (!navigator.locks) throw Error("Este navegador no permite proteger la operación de cuenta.");
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const end = new Promise<void>((r) => {
    release = r;
  });
  const lock = navigator.locks.request(trainingAccountLock(userId), async () => {
    entered();
    await end;
  });
  await Promise.race([
    ready,
    lock.then(() => {
      throw Error("No se pudo reservar la cuenta.");
    }),
  ]);
  return release;
}
/** No browser globals are touched during SSR construction. All writes stay on the captured owner. */
export function createTrainingBrowserStorage(
  userId: string,
  getStorage: () => DraftStorage = () => window.localStorage,
  getLocks: () => Locks | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
  canWrite: () => boolean = () => true,
): TrainingStorage & {
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
  compareAndRemove(key: string, before: string | null): Promise<void>;
} {
  z.uuid().parse(userId);
  const ownKey = `is:native-training:v1:${userId}`,
    queueKey = `is:native-sync:v1:${userId}`,
    guardKey = trainingGuardKey(userId),
    guard = JSON.stringify({ version: 4, userId, kind: "typed-training" });
  function own(key: string) {
    if (key !== ownKey && key !== queueKey)
      throw Error("El almacenamiento no corresponde a la cuenta capturada.");
  }
  function pending(key: string, value: string | null): boolean {
    if (value === null) return false;
    if (key === queueKey) {
      const parsed = workoutQueueEnvelopeSchema.parse(JSON.parse(value));
      if (parsed.userId !== userId) throw Error("La cola no corresponde a esta cuenta.");
      return parsed.entries.some((e) => e.phase === "pending");
    }
    const parsed = trainingEnvelopeSchema.parse(JSON.parse(value));
    if (parsed.userId !== userId || (parsed.active && parsed.active.draft.userId !== userId))
      throw Error("El registro no corresponde a esta cuenta.");
    return parsed.active !== null;
  }
  function anyPending(storage: DraftStorage, key: string, next: string | null) {
    return [ownKey, queueKey]
      .map((k) => pending(k, k === key ? next : storage.getItem(k)))
      .some(Boolean);
  }
  function checkGuard(storage: DraftStorage) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i),
        parts = key?.split(":");
      if (
        key &&
        parts?.[0] === "is" &&
        ["native-training", "native-sync"].includes(parts[1]) &&
        parts[3] === userId &&
        key !== ownKey &&
        key !== queueKey
      )
        throw Error("Un registro local requiere una versión compatible. Conservamos sus datos.");
    }
    const current = storage.getItem(guardKey);
    if (current !== null && current !== guard)
      throw Error("La protección local requiere una versión compatible. Conservamos sus datos.");
  }
  async function locked(key: string, operation: (s: DraftStorage) => void) {
    own(key);
    const locks = getLocks();
    if (!locks) throw new AtomicStoreError("unsupported");
    await locks.request(trainingAccountLock(userId), async () => {
      await locks.request("iron-strength-native-week:" + key, () => {
        if (!canWrite()) throw Error("La cuenta cambió. Conservamos el documento anterior.");
        const storage = getStorage();
        checkGuard(storage);
        operation(storage);
      });
    });
  }
  function removeGuard(storage: DraftStorage) {
    if (storage.getItem(guardKey) === guard) {
      storage.removeItem(guardKey);
      if (storage.getItem(guardKey) !== null)
        throw Error("No se confirmó la limpieza de la guarda local.");
    }
  }
  const compareAndSet = async (key: string, before: string | null, next: string) => {
    own(key);
    const nextPending = pending(key, next);
    await locked(key, (storage) => {
      if (storage.getItem(key) !== before) throw new AtomicStoreError("conflict");
      if (before !== null) pending(key, before);
      const protectedState = anyPending(storage, key, next);
      if (nextPending && key === ownKey && hasPreviousTraining(storage, userId))
        throw Error("Retoma o resuelve los borradores anteriores antes de registrar otra sesión.");
      if (protectedState) {
        storage.setItem(guardKey, guard);
        if (storage.getItem(guardKey) !== guard) throw Error("No se verificó la protección local.");
      }
      storage.setItem(key, next);
      if (storage.getItem(key) !== next)
        throw Error("No se confirmó el registro en este dispositivo.");
      if (!protectedState) removeGuard(storage);
    });
  };
  const compareAndRemove = async (key: string, before: string | null) =>
    locked(key, (storage) => {
      if (storage.getItem(key) !== before) throw new AtomicStoreError("conflict");
      if (pending(key, before))
        throw Error("Retoma o descarta explícitamente el entrenamiento antes de retirarlo.");
      const protectedState = anyPending(storage, key, null);
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw Error("No se confirmó la limpieza local.");
      if (!protectedState) removeGuard(storage);
    });
  return {
    async get(key) {
      own(key);
      const storage = getStorage();
      checkGuard(storage);
      return storage.getItem(key);
    },
    compareAndSet,
    compareAndRemove,
    async set(key, value) {
      own(key);
      await compareAndSet(key, getStorage().getItem(key), value);
    },
    async remove(key) {
      own(key);
      await compareAndRemove(key, getStorage().getItem(key));
    },
  };
}
