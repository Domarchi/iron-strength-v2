// Scoped KV adapter. Platform code supplies the exclusive SQLite updater and shared queue.
import {
  downloadKey,
  DownloadFault,
  downloadRecordSchema,
  type DownloadStorage,
} from "./download-controller";
type KV = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: (before: string | null) => string): Promise<void>;
  removeItemAsync(key: string): Promise<unknown>;
};
type Serialize = <T>(operation: () => Promise<T>) => Promise<T>;
export function createNativeDownloadStorage(
  userId: string,
  kv: KV,
  serialize: Serialize,
  owns: () => boolean,
): DownloadStorage & {
  clearReserved(
    confirmedAccountDeletion?: boolean,
  ): Promise<{ cleared: boolean; retainedUnknown: boolean }>;
} {
  const key = downloadKey(userId);
  const own = (candidate: string) => {
    if (candidate !== key || !owns()) throw new DownloadFault("account_changed");
  };
  return {
    get: async (candidate) => {
      own(candidate);
      return serialize(async () => {
        own(candidate);
        const value = await kv.getItemAsync(key);
        own(candidate);
        return value;
      });
    },
    compareAndSet: async (candidate, before, next) => {
      own(candidate);
      await serialize(async () => {
        own(candidate);
        // SDK58's functional setItemAsync executes the callback in an exclusive SQLite transaction.
        await kv.setItemAsync(key, (previous) => {
          own(candidate);
          if (previous !== before) throw new DownloadFault("conflict");
          return next;
        });
        own(candidate);
        if ((await kv.getItemAsync(key)) !== next) throw new DownloadFault("storage");
      });
    },
    // The coordinator reserves/stops downloads first. A confirmed deletion uses only this owner key.
    clearReserved: async (confirmedAccountDeletion = false) =>
      serialize(async () => {
        const raw = await kv.getItemAsync(key);
        if (raw === null) return { cleared: true, retainedUnknown: false };
        if (!confirmedAccountDeletion) {
          let known = false;
          try {
            const p = downloadRecordSchema.safeParse(JSON.parse(raw));
            known = p.success && p.data.userId === userId.toLowerCase();
          } catch {}
          if (!known) return { cleared: false, retainedUnknown: true };
        }
        await kv.removeItemAsync(key);
        if ((await kv.getItemAsync(key)) !== null) throw new DownloadFault("storage");
        return { cleared: true, retainedUnknown: false };
      }),
  };
}
