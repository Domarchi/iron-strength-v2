import { atomicStorage } from "./atomic-storage";
import { AtomicStoreError } from "./atomic-contract";
import { WeekStorageError, type WeekStorage } from "./week-download";
export const weekStorage: WeekStorage = {
  ...atomicStorage,
  async compareAndSet(key, before, next) {
    try {
      await atomicStorage.compareAndSet(key, before, next);
    } catch (e) {
      if (e instanceof AtomicStoreError) throw new WeekStorageError(e.reason);
      throw e;
    }
  },
};
