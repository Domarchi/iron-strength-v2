import Storage from "expo-sqlite/kv-store";
import { trainingStorage, runStorageOperation } from "./training-storage";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
export const atomicStorage: AtomicStorage = {
  ...trainingStorage,
  compareAndSet: (key, before, next) =>
    runStorageOperation(() =>
      Storage.setItemAsync(key, (previous) => {
        if (previous !== before) throw new AtomicStoreError("conflict");
        return next;
      }),
    ),
};
