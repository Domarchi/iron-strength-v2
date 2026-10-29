import { expect, it, vi } from "vitest";
import { createCoachEditorBrowserStorage, listCoachEditorEntries } from "./editor-browser";
import { coachEditorDraftKey, type CoachEditorDraft } from "./typed-editor-draft";
const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const id = crypto.randomUUID(),
  key = coachEditorDraftKey({ ...scope, id });
const draft: CoachEditorDraft = {
  version: 4,
  ...scope,
  id,
  revision: 3,
  updatedAt: "2026-10-28T12:00:00.000Z",
  edits: {},
  selection: [],
  additionSelection: [],
  bulk: null,
  alternatives: {},
  order: null,
  pending: null,
  previousRaw: null,
};
function setup() {
  const data = new Map<string, string>(),
    calls: string[] = [];
  let tail = Promise.resolve();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  const locks = {
    request: async (name: string, op: () => void) => {
      calls.push(name);
      const next = tail.then(op);
      tail = next.catch(() => {});
      await next;
    },
  };
  return {
    data,
    calls,
    storage,
    adapter: createCoachEditorBrowserStorage(
      scope,
      () => storage,
      () => locks,
    ),
  };
}
it("obtiene el bloqueo por clave, compara y relee escrituras y eliminaciones", async () => {
  const x = setup();
  expect(x.storage.getItem).not.toHaveBeenCalled();
  await x.adapter.compareAndSet(key, null, "documento");
  expect(x.calls).toEqual(["iron-strength-coach-editor:" + key]);
  expect(await x.adapter.get(key)).toBe("documento");
  await x.adapter.compareAndSet(key, "documento", null);
  expect(await x.adapter.get(key)).toBeNull();
});
it("dos pestañas no escriben desde la misma versión y una no borra cambios de la otra", async () => {
  const x = setup();
  x.data.set(key, "base");
  const results = await Promise.allSettled([
    x.adapter.compareAndSet(key, "base", "uno"),
    x.adapter.compareAndSet(key, "base", "dos"),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  await expect(x.adapter.compareAndSet(key, "base", null)).rejects.toMatchObject({
    reason: "conflict",
  });
  expect(x.data.get(key)).toBe("uno");
});
it("sin bloqueo, con cuota, o con una escritura o eliminación que no se conserva, falla", async () => {
  const x = setup(),
    unsupported = createCoachEditorBrowserStorage(
      scope,
      () => x.storage,
      () => undefined,
    );
  await expect(unsupported.compareAndSet(key, null, "x")).rejects.toMatchObject({
    reason: "unsupported",
  });
  x.storage.setItem.mockImplementationOnce(() => {
    throw Error("quota");
  });
  await expect(x.adapter.compareAndSet(key, null, "x")).rejects.toThrow("quota");
  x.storage.setItem.mockImplementationOnce(() => {});
  await expect(x.adapter.compareAndSet(key, null, "x")).rejects.toThrow("verificar");
  x.data.set(key, "x");
  x.storage.removeItem.mockImplementationOnce(() => {});
  await expect(x.adapter.compareAndSet(key, "x", null)).rejects.toThrow("verificar");
});
it("no lee ni toca claves de otra cuenta, programa, sesión o espacio", async () => {
  const x = setup();
  for (const other of [
    key.replace(scope.userId, crypto.randomUUID()),
    key.replace(scope.programId, crypto.randomUUID()),
    key.replace(scope.sessionId, crypto.randomUUID()),
    key.replace(":v1:", ":v99:"),
    "other",
  ]) {
    x.data.set(other, "privado");
    await expect(x.adapter.get(other)).rejects.toThrow();
    await expect(x.adapter.compareAndSet(other, "privado", null)).rejects.toThrow();
    expect(x.data.get(other)).toBe("privado");
  }
  expect(x.storage.getItem).not.toHaveBeenCalled();
});
it("descubre actuales, anteriores y desconocidos sin perder bytes ni mezclar cuenta o clave", () => {
  const x = setup(),
    foreign = coachEditorDraftKey({
      ...scope,
      id: crypto.randomUUID(),
      userId: crypto.randomUUID(),
    });
  x.data.set(key, JSON.stringify(draft));
  x.data.set(foreign, "privado");
  const future = coachEditorDraftKey({ ...scope, id: crypto.randomUUID() });
  x.data.set(future, '{"version":99}');
  const wrongKey = coachEditorDraftKey({ ...scope, id: crypto.randomUUID() });
  x.data.set(wrongKey, JSON.stringify(draft));
  const result = listCoachEditorEntries(scope, () => x.storage);
  expect(result.ok).toBe(true);
  expect(result.entries).toHaveLength(3);
  expect(result.entries.find((e) => e.key === key)?.entry.kind).toBe("current");
  expect(result.entries.find((e) => e.key === future)?.entry).toEqual({
    kind: "unknown",
    raw: '{"version":99}',
  });
  expect(result.entries.find((e) => e.key === wrongKey)?.entry.kind).toBe("unknown");
  expect(x.storage.setItem).not.toHaveBeenCalled();
  expect(x.storage.removeItem).not.toHaveBeenCalled();
});
it("un fallo de descubrimiento no se confunde con un dispositivo sin borradores", () => {
  const result = listCoachEditorEntries(scope, () => {
    throw Error("blocked");
  });
  expect(result).toMatchObject({ ok: false, entries: [] });
});
