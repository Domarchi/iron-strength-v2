// Account-scoped IndexedDB adapter; availability requires a verified complete download.
import {
  downloadKey,
  downloadRecordSchema,
  DownloadFault,
  type DownloadStorage,
} from "./download-controller";
import { trainingAccountLock } from "../workout/training-browser";
const DATABASE = "iron-strength-training-download";
const STORE = "bundles";
function fault(error: unknown) {
  return error instanceof DownloadFault
    ? error
    : new DownloadFault(
        error && typeof error === "object" && "name" in error && error.name === "QuotaExceededError"
          ? "quota"
          : "storage",
      );
}
async function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new DownloadFault("unsupported");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "userId" });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new DownloadFault("unsupported"));
    };
    request.onerror = () =>
      reject(new DownloadFault(request.error?.name === "VersionError" ? "format" : "storage"));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        reject(new DownloadFault("format"));
        return;
      }
      resolve(db);
    };
  });
}
function decode(row: unknown, userId: string): string | null {
  if (row === undefined) return null;
  if (
    !row ||
    typeof row !== "object" ||
    Object.keys(row).length !== 2 ||
    !("userId" in row) ||
    row.userId !== userId ||
    !("raw" in row) ||
    typeof row.raw !== "string"
  )
    throw new DownloadFault("format");
  return row.raw;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      db.close();
      reject(fault(error));
      return;
    }
    let result: T, failed: DownloadFault | undefined;
    const abort = (error: unknown) => {
      failed = fault(error);
      try {
        tx.abort();
      } catch {
        db.close();
        reject(failed);
      }
    };
    tx.onabort = () => {
      db.close();
      reject(failed ?? fault(tx.error));
    };
    tx.onerror = () => {};
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    const store = tx.objectStore(STORE);
    if (store.keyPath !== "userId") {
      abort(new DownloadFault("format"));
      return;
    }
    try {
      work(
        store,
        (value) => {
          result = value;
        },
        abort,
      );
    } catch (error) {
      abort(error);
    }
  });
}
export function createIndexedDownloadStorage(
  userId: string,
  canAccess: () => boolean,
  getLocks: () => LockManager | undefined = () =>
    typeof navigator === "undefined" ? undefined : navigator.locks,
): DownloadStorage & {
  clearReserved(
    confirmedAccountDeletion?: boolean,
  ): Promise<{ cleared: boolean; retainedUnknown: boolean }>;
} {
  const key = downloadKey(userId),
    owner = userId.toLowerCase();
  const own = (candidate: string) => {
    if (candidate !== key || !canAccess()) throw new DownloadFault("account_changed");
  };
  return {
    async get(candidate) {
      own(candidate);
      return transaction("readonly", (store, done, fail) => {
        const req = store.get(owner);
        req.onsuccess = () => {
          try {
            own(candidate);
            done(decode(req.result, owner));
          } catch (error) {
            fail(error);
          }
        };
      });
    },
    async compareAndSet(candidate, before, next) {
      own(candidate);
      const locks = getLocks();
      if (!locks) throw new DownloadFault("unsupported");
      await locks.request(trainingAccountLock(owner), async () => {
        own(candidate);
        await transaction<void>("readwrite", (store, done, fail) => {
          const req = store.get(owner);
          req.onsuccess = () => {
            try {
              own(candidate);
              if (decode(req.result, owner) !== before) throw new DownloadFault("conflict");
              const write = store.put({ userId: owner, raw: next });
              write.onerror = () => fail(write.error);
              write.onsuccess = () => {
                const verify = store.get(owner);
                verify.onsuccess = () => {
                  try {
                    own(candidate);
                    if (decode(verify.result, owner) !== next) throw new DownloadFault("storage");
                    done();
                  } catch (error) {
                    fail(error);
                  }
                };
              };
            } catch (error) {
              fail(error);
            }
          };
        });
      });
    },
    // The account coordinator must hold the same account lock and stop downloads before this call.
    // Routine logout preserves unknown documents; a confirmed account deletion may erase its own key.
    async clearReserved(confirmedAccountDeletion = false) {
      return transaction("readwrite", (store, done, fail) => {
        const req = store.get(owner);
        req.onsuccess = () => {
          try {
            if (req.result === undefined) {
              done({ cleared: true, retainedUnknown: false });
              return;
            }
            if (!confirmedAccountDeletion) {
              let known = false;
              try {
                const raw = decode(req.result, owner);
                const value = raw === null ? null : downloadRecordSchema.safeParse(JSON.parse(raw));
                known = !!value && value.success && value.data.userId === owner;
              } catch {}
              if (!known) {
                done({ cleared: false, retainedUnknown: true });
                return;
              }
            }
            const remove = store.delete(owner);
            remove.onsuccess = () => {
              const verify = store.get(owner);
              verify.onsuccess = () => {
                if (verify.result !== undefined) {
                  fail(new DownloadFault("storage"));
                  return;
                }
                done({ cleared: true, retainedUnknown: false });
              };
            };
          } catch (error) {
            fail(error);
          }
        };
      });
    },
  };
}
