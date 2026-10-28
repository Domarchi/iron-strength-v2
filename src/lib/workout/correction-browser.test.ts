import { expect, it, vi } from "vitest";
import { createCorrectionBrowserStorage } from "./correction-browser";
function setup() {
  const data = new Map<string, string>(),
    calls: string[] = [];
  let tail = Promise.resolve();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
  const adapter = createCorrectionBrowserStorage(
    () => storage,
    () => ({
      request: async (name: string, operation: () => void) => {
        calls.push(name);
        const next = tail.then(operation);
        tail = next.catch(() => {});
        await next;
      },
    }),
  );
  return { data, storage, calls, adapter };
}
it("lee solo cuando se solicita y usa el bloqueo compartido con Expo web", async () => {
  const x = setup();
  expect(x.storage.getItem).not.toHaveBeenCalled();
  await expect(x.adapter.get("cuenta")).resolves.toBeNull();
  await x.adapter.compareAndSet("cuenta", null, "propuesta");
  expect(x.calls).toEqual(["iron-strength-native-week:cuenta"]);
  expect(await x.adapter.get("cuenta")).toBe("propuesta");
});
it("dos propuestas de una misma base se serializan y solo una confirma", async () => {
  const x = setup();
  x.data.set("cuenta", "base");
  const results = await Promise.allSettled([
    x.adapter.compareAndSet("cuenta", "base", "uno"),
    x.adapter.compareAndSet("cuenta", "base", "dos"),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(results[1].status === "rejected" && results[1].reason.reason).toBe("conflict");
  expect(x.data.get("cuenta")).toBe("uno");
});
it("compara los bytes al obtener el bloqueo y conserva versiones desconocidas", async () => {
  const x = setup();
  x.data.set("cuenta", '{"version":99}');
  await expect(x.adapter.compareAndSet("cuenta", "base", "propuesta")).rejects.toMatchObject({
    reason: "conflict",
  });
  expect(x.data.get("cuenta")).toBe('{"version":99}');
  expect(x.storage.setItem).not.toHaveBeenCalled();
});
it("sin Web Locks no escribe ni transforma una propuesta en guardada", async () => {
  const x = setup(),
    adapter = createCorrectionBrowserStorage(
      () => x.storage,
      () => undefined,
    );
  await expect(adapter.compareAndSet("cuenta", null, "propuesta")).rejects.toMatchObject({
    reason: "unsupported",
  });
  expect(x.storage.setItem).not.toHaveBeenCalled();
});
it("almacenamiento inaccesible o sin espacio conserva el contenido anterior", async () => {
  const x = setup();
  x.data.set("cuenta", "base");
  x.storage.setItem.mockImplementationOnce(() => {
    throw Error("quota");
  });
  await expect(x.adapter.compareAndSet("cuenta", "base", "propuesta")).rejects.toThrow("quota");
  expect(x.data.get("cuenta")).toBe("base");
  const blocked = createCorrectionBrowserStorage(
    () => {
      throw Error("blocked");
    },
    () => undefined,
  );
  await expect(blocked.get("cuenta")).rejects.toThrow("blocked");
});
it("una escritura no cambia claves de otras cuentas", async () => {
  const x = setup();
  x.data.set("otro", "privado");
  await x.adapter.compareAndSet("cuenta", null, "propuesta");
  expect(x.data.get("otro")).toBe("privado");
});
