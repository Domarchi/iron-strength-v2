import { trainingStorage } from "./training-storage";
import { WeekStorageError, type WeekStorage } from "./week-download";
export const weekStorage: WeekStorage = {
  ...trainingStorage,
  async compareAndSet(key, before, next) {
    if (typeof navigator === "undefined" || !navigator.locks)
      throw new WeekStorageError("unsupported");
    await navigator.locks.request("iron-strength-native-week:" + key, () => {
      if (localStorage.getItem(key) !== before) throw new WeekStorageError("conflict");
      localStorage.setItem(key, next);
    });
  },
};
