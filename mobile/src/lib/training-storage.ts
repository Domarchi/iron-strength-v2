import Storage from "expo-sqlite/kv-store";
import type { TrainingStorage } from "./training";
import { createStorageQueue } from "./storage-queue";
export const runStorageOperation = createStorageQueue();
export const trainingStorage: TrainingStorage = {
  get: (key) => runStorageOperation(() => Storage.getItemAsync(key)),
  set: (key, value) => runStorageOperation(() => Storage.setItemAsync(key, value)),
  remove: (key) =>
    runStorageOperation(async () => {
      await Storage.removeItemAsync(key);
    }),
};
