// Browser test entry only. Not imported by application routes or public assets.
import {
  DownloadController,
  downloadKey,
  downloadRecordSchema,
} from "../../src/lib/offline/download-controller";
import { bundleSchema } from "../../src/lib/offline/training-bundle";
import { createIndexedDownloadStorage } from "../../src/lib/offline/indexed-download-storage";
import { trainingAccountLock } from "../../src/lib/workout/training-browser";
function createProbe() {
  const owner = "ad220000-0000-4000-8000-000000000001",
    other = "ad220000-0000-4000-8000-000000000002",
    identityKey = "is:test-download:active-owner";
  localStorage.setItem(identityKey, owner);
  const store = createIndexedDownloadStorage(
      owner,
      () => localStorage.getItem(identityKey) === owner,
    ),
    otherStore = createIndexedDownloadStorage(other, () => true),
    key = downloadKey(owner),
    otherKey = downloadKey(other);
  const makeBundle = (at = "2026-10-29T12:00:00Z") =>
    bundleSchema.parse({
      version: 1,
      userId: owner,
      downloadedAt: at,
      catalog: { version: 2, exercises: [] },
      library: { version: 2, userId: owner, folders: [], routines: [] },
      week: null,
      history: {},
    });
  let nextBundle = makeBundle(),
    releaseAccount: (() => void) | undefined,
    accountLock: Promise<unknown> | undefined;
  const controller = () =>
    new DownloadController(
      owner,
      store,
      async () => nextBundle,
      () => localStorage.getItem(identityKey) === owner,
    );
  const probe = {
    owner,
    other,
    key,
    otherKey,
    store,
    otherStore,
    makeBundle,
    controller,
    writeStarted: false,
    async first() {
      await store.compareAndSet(key, null, "first");
      let conflict = false,
        foreign = false;
      try {
        await store.compareAndSet(key, null, "second");
      } catch (e) {
        conflict = e instanceof Error && "code" in e && e.code === "conflict";
      }
      try {
        await store.get(otherKey);
      } catch (e) {
        foreign = e instanceof Error && "code" in e && e.code === "account_changed";
      }
      const preserved = (await store.get(key)) === "first";
      await navigator.locks.request(trainingAccountLock(owner), () => store.clearReserved(true));
      const c = controller();
      await c.restore();
      const created = await c.download();
      nextBundle = makeBundle("2026-10-29T13:00:00Z");
      const updated = await c.download();
      return { conflict, foreign, preserved, created, updated };
    },
    async cold() {
      const c = controller();
      await c.restore();
      const raw = await store.get(key);
      if (raw === null) throw Error("missing cache");
      const record = downloadRecordSchema.parse(JSON.parse(raw));
      return {
        verified: c.getSnapshot().verified,
        current: record.bundle?.downloadedAt,
        previous: record.previousBundle?.downloadedAt,
      };
    },
    async quota() {
      const c = controller();
      await c.restore();
      const before = await store.get(key);
      nextBundle = makeBundle("2026-10-29T14:00:00Z");
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, k?: IDBValidKey) {
        if (this.name === "bundles")
          throw new DOMException("simulated quota", "QuotaExceededError");
        return original.call(this, value, k);
      };
      let saved = false;
      try {
        saved = await c.download();
      } finally {
        IDBObjectStore.prototype.put = original;
      }
      return {
        saved,
        verified: c.getSnapshot().verified,
        preserved: (await store.get(key)) === before,
        code: c.getSnapshot().error?.code,
      };
    },
    async mismatch() {
      const c = controller();
      await c.restore();
      const before = await store.get(key);
      nextBundle = makeBundle("2026-10-29T15:00:00Z");
      const original = IDBObjectStore.prototype.get,
        getResult = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result")?.get;
      if (!getResult) throw Error("missing getter");
      let seen = 0;
      IDBObjectStore.prototype.get = function (k: IDBValidKey | IDBKeyRange) {
        const request = original.call(this, k);
        if (this.name === "bundles" && k === owner && ++seen === 2)
          Object.defineProperty(request, "result", {
            get() {
              const row: unknown = Reflect.apply(getResult, request, []);
              return row && typeof row === "object"
                ? { ...row, raw: "verification mismatch" }
                : row;
            },
          });
        return request;
      };
      let saved = false;
      try {
        saved = await c.download();
      } finally {
        IDBObjectStore.prototype.get = original;
      }
      return {
        saved,
        verified: c.getSnapshot().verified,
        preserved: (await store.get(key)) === before,
        code: c.getSnapshot().error?.code,
      };
    },
    async unknown() {
      await otherStore.compareAndSet(otherKey, null, "other account cache");
      const before = await store.get(key);
      await store.compareAndSet(key, before, '{"version":99}');
      const kept = await navigator.locks.request(trainingAccountLock(owner), () =>
          store.clearReserved(),
        ),
        unknownIntact = (await store.get(key)) === '{"version":99}';
      const removed = await navigator.locks.request(trainingAccountLock(owner), () =>
        store.clearReserved(true),
      );
      const c = controller();
      await c.restore();
      nextBundle = makeBundle();
      await c.download();
      localStorage.setItem(`is:native-training:v1:${owner}`, "frozen training bytes");
      return {
        kept,
        unknownIntact,
        removed,
        otherIntact: (await otherStore.get(otherKey)) === "other account cache",
      };
    },
    async hold() {
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        end = new Promise<void>((resolve) => {
          releaseAccount = resolve;
        });
      accountLock = navigator.locks.request(trainingAccountLock(owner), async () => {
        entered();
        await end;
      });
      await ready;
    },
    async writeAfterAccount() {
      const before = await store.get(key);
      probe.writeStarted = true;
      try {
        await store.compareAndSet(key, before, "must not revive");
        return { saved: true, code: null };
      } catch (error) {
        return {
          saved: false,
          code: error instanceof Error && "code" in error ? error.code : null,
        };
      }
    },
    async deleteAndRelease() {
      localStorage.setItem(identityKey, other);
      try {
        await store.clearReserved(true);
      } finally {
        releaseAccount?.();
        await accountLock;
      }
    },
    async isolation() {
      localStorage.setItem(identityKey, owner);
      return {
        empty: (await store.get(key)) === null,
        other: (await otherStore.get(otherKey)) === "other account cache",
        training:
          localStorage.getItem(`is:native-training:v1:${owner}`) === "frozen training bytes",
      };
    },
  };
  return probe;
}
declare global {
  interface Window {
    IronDownloadProbe: ReturnType<typeof createProbe>;
  }
}
window.IronDownloadProbe = createProbe();
