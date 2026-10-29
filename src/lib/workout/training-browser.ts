import { z } from "zod";
import { trainingEnvelopeSchema, type TrainingStorage } from "../../../mobile/src/lib/training";
import { AtomicStoreError } from "../../../mobile/src/lib/atomic-contract";
import { hasPreviousTraining, trainingGuardKey } from "./training-guard";
import type { DraftStorage } from "./draft";
type Locks = { request(name: string, operation: () => void): Promise<unknown> };
/** No browser globals are touched during SSR construction. All writes stay on the captured owner. */
export function createTrainingBrowserStorage(
  userId: string,
  getStorage: () => DraftStorage = () => window.localStorage,
  getLocks: () => Locks | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
): TrainingStorage & {
  compareAndSet(key: string, before: string | null, next: string): Promise<void>;
  compareAndRemove(key: string, before: string | null): Promise<void>;
} {
  z.uuid().parse(userId);
  const ownKey = `is:native-training:v1:${userId}`,
    guardKey = trainingGuardKey(userId),
    guard = JSON.stringify({ version: 4, userId, kind: "typed-training" });
  function own(key: string) {
    if (key !== ownKey) throw Error("El almacenamiento no corresponde a la cuenta capturada.");
  }
  function record(value: string) {
    const parsed = trainingEnvelopeSchema.parse(JSON.parse(value));
    if (parsed.userId !== userId || (parsed.active && parsed.active.draft.userId !== userId))
      throw Error("El registro no corresponde a esta cuenta.");
    return parsed;
  }
  function checkGuard(storage: DraftStorage) {
    const current = storage.getItem(guardKey);
    if (current !== null && current !== guard)
      throw Error("La protección local requiere una versión compatible. Conservamos sus datos.");
  }
  async function locked(key: string, operation: (s: DraftStorage) => void) {
    own(key);
    const locks = getLocks();
    if (!locks) throw new AtomicStoreError("unsupported");
    await locks.request("iron-strength-native-week:" + key, () => {
      const storage = getStorage();
      checkGuard(storage);
      operation(storage);
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
    const value = record(next);
    await locked(key, (storage) => {
      if (storage.getItem(key) !== before) throw new AtomicStoreError("conflict");
      if (before !== null) record(before);
      if (value.active) {
        if (hasPreviousTraining(storage, userId))
          throw Error(
            "Retoma o resuelve los borradores anteriores antes de registrar otra sesión.",
          );
        storage.setItem(guardKey, guard);
        if (storage.getItem(guardKey) !== guard) throw Error("No se verificó la protección local.");
      }
      storage.setItem(key, next);
      if (storage.getItem(key) !== next)
        throw Error("No se confirmó el registro en este dispositivo.");
      if (!value.active) removeGuard(storage);
    });
  };
  const compareAndRemove = async (key: string, before: string | null) =>
    locked(key, (storage) => {
      if (storage.getItem(key) !== before) throw new AtomicStoreError("conflict");
      if (before !== null && record(before).active)
        throw Error("Retoma o descarta explícitamente el entrenamiento antes de retirarlo.");
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw Error("No se confirmó la limpieza local.");
      removeGuard(storage);
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
