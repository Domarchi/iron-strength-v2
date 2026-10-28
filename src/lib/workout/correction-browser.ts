import type { CorrectionStorage } from "./correction-draft";
type BrowserStorage = Pick<Storage, "getItem" | "setItem">;
type BrowserLocks = { request(name: string, operation: () => void): Promise<unknown> };
class CorrectionBrowserStorageError extends Error {
  constructor(readonly reason: "conflict" | "unsupported") {
    super(
      reason === "conflict"
        ? "La corrección cambió en otra ventana."
        : "El almacenamiento no permite una escritura protegida.",
    );
  }
}
/** Lazy browser access also permits constructing the form during server rendering. */
export function createCorrectionBrowserStorage(
  getStorage: () => BrowserStorage = () => window.localStorage,
  getLocks: () => BrowserLocks | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
): CorrectionStorage {
  return {
    async get(key) {
      return getStorage().getItem(key);
    },
    async compareAndSet(key, before, next) {
      const locks = getLocks();
      if (!locks) throw new CorrectionBrowserStorageError("unsupported");
      // Same lock name as Expo web for the same versioned correction envelope.
      await locks.request("iron-strength-native-week:" + key, () => {
        const storage = getStorage();
        if (storage.getItem(key) !== before) throw new CorrectionBrowserStorageError("conflict");
        storage.setItem(key, next);
      });
    },
  };
}
