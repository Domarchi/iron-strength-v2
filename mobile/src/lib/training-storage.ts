import Storage from "expo-sqlite/kv-store";
import type { TrainingStorage } from "./training";
export const trainingStorage: TrainingStorage = {
  get: (key) => Storage.getItemAsync(key),
  set: (key, value) => Storage.setItemAsync(key, value),
  remove: async (key) => {
    await Storage.removeItemAsync(key);
  },
};
