import { expect, it, vi } from "vitest";
import { CoachOrphanEditorRecovery, listOrphanCoachEditorEntries } from "./orphan-editor-recovery";
import { coachEditorDraftKey, type CoachEditorDraft } from "./typed-editor-draft";
const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const request = {
  version: 2 as const,
  id: crypto.randomUUID(),
  revision: 3,
  operation: "order" as const,
  data: { ids: [crypto.randomUUID()] },
};
function setup() {
  const draft: CoachEditorDraft = {
    version: 4,
    ...scope,
    id: crypto.randomUUID(),
    revision: 3,
    updatedAt: "2026-10-29T00:00:00.000Z",
    edits: {},
    title: "Propuesta conservada",
    selection: [],
    additionSelection: [],
    bulk: null,
    alternatives: {},
    order: [],
    pending: request,
    previousRaw: null,
  };
  const raw = JSON.stringify(draft),
    key = coachEditorDraftKey(draft),
    data = new Map([[key, raw]]);
  const storage = {
    get: async (key: string) => data.get(key) ?? null,
    compareAndSet: async (key: string, before: string | null, next: string | null) => {
      if ((data.get(key) ?? null) !== before) throw Error("conflict");
      if (next === null) data.delete(key);
      else data.set(key, next);
    },
  };
  const mutate = vi.fn(async () => ({
    ok: true,
    result: {
      version: 2,
      id: request.id,
      sessionId: scope.sessionId,
      revision: 4,
      status: "removed",
    },
  }));
  const legacy = vi.fn();
  const recovery = new CoachOrphanEditorRecovery({ scope, key, raw }, { storage, mutate, legacy });
  return { data, raw, key, mutate, legacy, recovery, storage };
}
it("confirma el recibo sin origen, conserva el documento exacto y exige retiro explícito", async () => {
  const x = setup();
  expect(await x.recovery.remove(false)).toBe(false);
  expect(await x.recovery.verify()).toBe(true);
  expect(x.mutate).toHaveBeenCalledWith({ ...scope, request });
  expect(x.recovery.getSnapshot().confirmed).toBe(true);
  expect(x.data.get(x.key)).toBe(x.raw);
  expect(await x.recovery.verify()).toBe(true);
  expect(x.mutate).toHaveBeenCalledTimes(1);
  expect(await x.recovery.remove(true)).toBe(true);
  expect(x.data.size).toBe(0);
});
it("una respuesta ajena o perdida conserva el intento y al recargar vuelve a verificar con servidor", async () => {
  const x = setup();
  x.mutate.mockResolvedValueOnce({
    ok: true,
    result: {
      version: 2,
      id: crypto.randomUUID(),
      sessionId: scope.sessionId,
      revision: 4,
      status: "removed",
    },
  });
  expect(await x.recovery.verify()).toBe(false);
  expect(await x.recovery.remove(true)).toBe(false);
  expect(x.data.get(x.key)).toBe(x.raw);
  expect(await x.recovery.verify()).toBe(true);
});
it("un cambio desde otra pestaña impide enviar y retirar, incluso después de recibir confirmación", async () => {
  const x = setup();
  x.data.set(x.key, x.raw + " ");
  expect(await x.recovery.verify()).toBe(false);
  expect(x.mutate).not.toHaveBeenCalled();
  x.data.set(x.key, x.raw);
  expect(await x.recovery.verify()).toBe(true);
  x.data.set(x.key, x.raw + " ");
  expect(await x.recovery.remove(true)).toBe(false);
  expect(x.data.get(x.key)).toBe(x.raw + " ");
});
it("descubre solo sesiones ausentes de este programa/cuenta y conserva formatos desconocidos", () => {
  const x = setup(),
    foreign = coachEditorDraftKey({
      ...scope,
      userId: crypto.randomUUID(),
      id: crypto.randomUUID(),
    });
  x.data.set(foreign, '{"version":99}');
  const storage = {
    setItem: (key: string, raw: string) => {
      x.data.set(key, raw);
    },
    removeItem: (key: string) => {
      x.data.delete(key);
    },
    getItem: (key: string) => x.data.get(key) ?? null,
    key: (i: number) => [...x.data.keys()][i] ?? null,
    get length() {
      return x.data.size;
    },
  };
  expect(
    listOrphanCoachEditorEntries(scope.userId, scope.programId, [scope.sessionId], () => storage)
      .entries,
  ).toHaveLength(0);
  const found = listOrphanCoachEditorEntries(scope.userId, scope.programId, [], () => storage);
  expect(found.ok).toBe(true);
  expect(found.entries.map((e) => e.key)).toEqual([x.key]);
  x.data.set(x.key, '{"version":99}');
  expect(
    listOrphanCoachEditorEntries(scope.userId, scope.programId, [], () => storage).entries[0].raw,
  ).toBe('{"version":99}');
});
it("mantiene los dos intentos legados exactos hasta confirmarlos ambos y rechaza una copia ajena", async () => {
  const x = setup(),
    id = crypto.randomUUID(),
    save = crypto.randomUUID(),
    copy = crypto.randomUUID();
  const raw = JSON.stringify({
    version: 3,
    ...scope,
    id,
    revision: 3,
    updatedAt: "2026-10-29T00:00:00.000Z",
    edits: {},
    order: null,
    orderRequest: null,
    copyRequest: { id: copy },
    saveRequest: { id: save, revision: 3, rows: [], title: "Título pendiente" },
  });
  const key = coachEditorDraftKey({ ...scope, id });
  x.data.set(key, raw);
  const legacy = vi.fn(async ({ operation }: { operation: string }) => ({
    ok: true,
    version: 1,
    id: operation === "copy" ? copy : save,
    sessionId: scope.sessionId,
    operation,
    ...(operation === "copy" ? { copyId: copy } : { revision: 4 }),
  }));
  const recovery = new CoachOrphanEditorRecovery(
    { scope, key, raw },
    { storage: x.storage, mutate: x.mutate, legacy },
  );
  expect(await recovery.verify("save")).toBe(true);
  expect(recovery.getSnapshot().confirmed).toBe(false);
  expect(await recovery.remove(true)).toBe(false);
  legacy.mockResolvedValueOnce({
    ok: true,
    version: 1,
    id: copy,
    sessionId: scope.sessionId,
    operation: "copy",
    copyId: crypto.randomUUID(),
  });
  expect(await recovery.verify("copy")).toBe(false);
  expect(await recovery.verify("copy")).toBe(true);
  expect(recovery.getSnapshot().confirmed).toBe(true);
  expect(legacy.mock.calls.map(([call]) => call)).toEqual([
    { ...scope, raw, operation: "save" },
    { ...scope, raw, operation: "copy" },
    { ...scope, raw, operation: "copy" },
  ]);
  expect(x.data.get(key)).toBe(raw);
});
it("un formato futuro no envía ni retira nada y el descubrimiento denegado no acredita lista vacía", async () => {
  const x = setup(),
    raw = '{"version":99}',
    future = new CoachOrphanEditorRecovery(
      { scope, key: x.key, raw },
      { storage: x.storage, mutate: x.mutate, legacy: x.legacy },
    );
  x.data.set(x.key, raw);
  expect(await future.verify()).toBe(false);
  expect(await future.remove(true)).toBe(false);
  expect(x.mutate).not.toHaveBeenCalled();
  expect(x.data.get(x.key)).toBe(raw);
  expect(
    listOrphanCoachEditorEntries(scope.userId, scope.programId, [], () => {
      throw Error("denied");
    }).ok,
  ).toBe(false);
});
it("una clave que no coincide con la identidad del documento se conserva como desconocida", async () => {
  const x = setup(),
    key = coachEditorDraftKey({ ...scope, id: crypto.randomUUID() });
  x.data.set(key, x.raw);
  const recovery = new CoachOrphanEditorRecovery(
    { scope, key, raw: x.raw },
    { storage: x.storage, mutate: x.mutate, legacy: x.legacy },
  );
  expect(recovery.entry.kind).toBe("unknown");
  expect(await recovery.verify()).toBe(false);
  expect(await recovery.remove(true)).toBe(false);
  expect(x.mutate).not.toHaveBeenCalled();
  expect(x.data.get(key)).toBe(x.raw);
});
