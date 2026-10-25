import { trainingStorage } from "./training-storage";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
export const atomicStorage: AtomicStorage = {
  ...trainingStorage,
  async compareAndSet(key, before, next) {
    if (typeof navigator === "undefined" || !navigator.locks)
      throw new AtomicStoreError("unsupported");
    // Keep the T197 lock name so an older open web client uses the same lock for a week key.
    await navigator.locks.request("iron-strength-native-week:" + key, () => {
      if (localStorage.getItem(key) !== before) throw new AtomicStoreError("conflict");
      localStorage.setItem(key, next);
    });
  },
};
