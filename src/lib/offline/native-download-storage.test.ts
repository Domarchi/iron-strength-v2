import { expect, it } from "vitest";
import { createNativeDownloadStorage } from "./native-download-storage";
import { downloadKey } from "./download-controller";
import { createStorageQueue } from "../../../mobile/src/lib/storage-queue";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
function setup() {
  const map = new Map<string, string>();
  let owns = true;
  const kv = {
    getItemAsync: async (key: string) => map.get(key) ?? null,
    setItemAsync: async (key: string, value: (before: string | null) => string) => {
      const next = value(map.get(key) ?? null);
      map.set(key, next);
    },
    removeItemAsync: async (key: string) => {
      map.delete(key);
    },
  };
  const queue = createStorageQueue(),
    storage = createNativeDownloadStorage(owner, kv, queue, () => owns);
  return {
    map,
    kv,
    queue,
    storage,
    leave: () => {
      owns = false;
    },
  };
}
it("CAS por clave propia no pisa bytes nuevos ni otra cuenta o cierre congelado", async () => {
  const x = setup(),
    key = downloadKey(owner);
  x.map.set(downloadKey(other), "foreign");
  x.map.set(`is:native-sync:v1:${owner}`, "frozen");
  await x.storage.compareAndSet(key, null, "one");
  await expect(x.storage.compareAndSet(key, null, "two")).rejects.toMatchObject({
    code: "conflict",
  });
  expect(await x.storage.get(key)).toBe("one");
  await expect(x.storage.get(downloadKey(other))).rejects.toMatchObject({
    code: "account_changed",
  });
  expect(x.map.get(downloadKey(other))).toBe("foreign");
  expect(x.map.get(`is:native-sync:v1:${owner}`)).toBe("frozen");
});
it("una escritura en espera verifica cuenta dentro de la operación física", async () => {
  const x = setup();
  let release!: () => void;
  const blocker = x.queue(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  await Promise.resolve();
  const pending = x.storage.compareAndSet(downloadKey(owner), null, "late");
  x.leave();
  release();
  await blocker;
  await expect(pending).rejects.toMatchObject({ code: "account_changed" });
  expect(x.map.has(downloadKey(owner))).toBe(false);
});
it("desconocido se conserva al salir; eliminación confirmada limpia solo su clave", async () => {
  const x = setup();
  x.map.set(downloadKey(owner), "future-version");
  x.map.set(downloadKey(other), "foreign");
  expect(await x.storage.clearReserved()).toEqual({ cleared: false, retainedUnknown: true });
  expect(x.map.get(downloadKey(owner))).toBe("future-version");
  expect(await x.storage.clearReserved(true)).toEqual({ cleared: true, retainedUnknown: false });
  expect(x.map.get(downloadKey(other))).toBe("foreign");
});
it("fallo del backend conserva la copia y se propaga sin afirmar persistencia", async () => {
  const x = setup();
  x.map.set(downloadKey(owner), "previous");
  x.kv.setItemAsync = async () => {
    throw Object.assign(Error("full"), { code: "SQLITE_FULL" });
  };
  await expect(
    x.storage.compareAndSet(downloadKey(owner), "previous", "next"),
  ).rejects.toMatchObject({ code: "SQLITE_FULL" });
  expect(x.map.get(downloadKey(owner))).toBe("previous");
});
