import Storage from "expo-sqlite/kv-store";
import { trainingStorage, runStorageOperation } from "./training-storage";
import { WeekStorageError, type WeekStorage } from "./week-download";
export const weekStorage: WeekStorage = {
  ...trainingStorage,
  compareAndSet: (key, before, next) =>
    runStorageOperation(() =>
      Storage.setItemAsync(key, (previous) => {
        if (previous !== before) throw new WeekStorageError("conflict");
        return next;
      }),
    ),
};
