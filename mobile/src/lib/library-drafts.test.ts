import { describe, expect, it, vi } from "vitest";
import { LibraryDraftController } from "./library-drafts";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
import { prepareWorkoutRoutine } from "../../../src/domain/workout-routine";
import { repeatWorkoutFixture } from "../../../src/test/fixtures/repeat-workout";
import type {
  PersonalMutation,
  PersonalMutationResult,
} from "../../../src/lib/mobile/personal-contracts";
const id = (n: number) => `af210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = id(900),
  key = `is:native-library:v1:${user}`;
function setup() {
  const map = new Map<string, string>();
  let n = 100;
  const storage: AtomicStorage = {
    get: vi.fn(async (k) => map.get(k) ?? null),
    set: vi.fn(async (k, v) => {
      map.set(k, v);
    }),
    remove: vi.fn(async (k) => {
      map.delete(k);
    }),
    compareAndSet: vi.fn(async (k, b, v) => {
      if ((map.get(k) ?? null) !== b) throw new AtomicStoreError("conflict");
      map.set(k, v);
    }),
  };
  const save = vi.fn(async (input: PersonalMutation): Promise<PersonalMutationResult> => ({
    requestId: input.requestId,
    targetId: input.targetId,
    revision: 1,
    status: "created" as const,
    duplicate: false,
  }));
  const create = (account = user) =>
    new LibraryDraftController(account, storage, save, () => id(n++));
  return { map, storage, save, create };
}
describe("borradores de rutinas personales", () => {
  it("sustituye solo una consulta sin cambios y rechaza objetivos inválidos antes de escribir", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const base = {
      id: id(640),
      name: "Consultada",
      folderId: null,
      revision: 1,
      position: 0,
      createdAt: "2026-10-26T10:00:00Z",
      updatedAt: "2026-10-26T10:00:00Z",
      items: [],
    };
    await a.createDraft(base);
    const f = repeatWorkoutFixture(),
      prepared = prepareWorkoutRoutine(f.workout, f.catalog);
    if (!prepared.ok) throw Error(prepared.message);
    const draft = {
      id: base.id,
      name: "Revisada",
      folderId: null,
      baseRevision: 3,
      changed: true,
      items: prepared.items,
    };
    const before = x.map.get(key);
    await expect(
      a.stageDraft({
        ...draft,
        items: draft.items.map((item, i) => (i ? item : { ...item, sets: "11" })),
      }),
    ).rejects.toThrow();
    expect(x.map.get(key)).toBe(before);
    await a.stageDraft(draft);
    expect(a.getSnapshot().drafts).toEqual([draft]);
  });
  it("protege una propuesta completa en una escritura, la recupera y reintenta el mismo recibo", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const f = repeatWorkoutFixture(),
      prepared = prepareWorkoutRoutine(f.workout, f.catalog);
    if (!prepared.ok) throw Error(prepared.message);
    const draft = {
      id: id(600),
      baseRevision: 4,
      folderId: id(601),
      name: prepared.title,
      items: prepared.items,
      changed: true,
    };
    await a.stageDraft(draft);
    expect(x.storage.compareAndSet).toHaveBeenCalledOnce();
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().drafts).toEqual([draft]);
    x.save.mockRejectedValueOnce(Error("respuesta perdida"));
    await expect(b.saveDraft(draft.id)).rejects.toThrow("perdida");
    const c = x.create();
    await c.restore();
    await c.retryPending();
    expect(x.save.mock.calls[0][0]).toMatchObject({
      operation: "routine_save",
      expectedRevision: 4,
    });
    expect(x.save.mock.calls[1][0]).toEqual(x.save.mock.calls[0][0]);
  });
  it("no sustituye un borrador modificado, un pendiente ni datos desconocidos", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    const original = structuredClone(a.getSnapshot().drafts[0]);
    await expect(a.stageDraft({ ...original, name: "Reemplazo" })).rejects.toThrow("borrador");
    expect(a.getSnapshot().drafts[0]).toEqual(original);
    x.save.mockRejectedValueOnce(Error("red"));
    await a.edit(draftId, (d) => ({ ...d, name: "Original" }));
    await expect(a.saveDraft(draftId)).rejects.toThrow();
    await expect(a.stageDraft({ ...original, id: id(610) })).rejects.toThrow("pendiente");
    x.map.set(key, '{"version":99}');
    const b = x.create();
    await b.restore();
    await expect(b.stageDraft(original)).rejects.toThrow();
    expect(x.map.get(key)).toBe('{"version":99}');
  });
  it("cuota conserva la propuesta completa en memoria y otra ventana no es sobrescrita", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draft = {
      id: id(620),
      baseRevision: null,
      folderId: null,
      name: "Propuesta",
      items: [],
      changed: true,
    };
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.stageDraft(draft)).rejects.toThrow();
    expect(a.getSnapshot().drafts).toEqual([draft]);
    await expect(a.stageDraft({ ...draft, id: id(622) })).rejects.toThrow("pendiente");
    expect(a.getSnapshot().drafts).toEqual([draft]);
    await a.retryStorage();
    const b = x.create();
    await b.restore();
    await a.edit(draft.id, (d) => ({ ...d, name: "Otra ventana" }));
    const before = x.map.get(key);
    await expect(b.stageDraft({ ...draft, id: id(621) })).rejects.toThrow("otra ventana");
    expect(x.map.get(key)).toBe(before);
    expect(b.getSnapshot().drafts.at(-1)).toMatchObject({ id: id(621) });
  });
  it("consultar sin editar no bloquea salida y cambios nunca son sustituidos por revalidación", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const base = {
      id: id(1),
      name: "Base",
      folderId: null,
      position: 0,
      revision: 2,
      createdAt: "2026-10-26T10:00:00Z",
      updatedAt: "2026-10-26T10:00:00Z",
      items: [],
    };
    await a.createDraft(base);
    expect(a.getSnapshot().drafts[0].changed).toBe(false);
    await a.clearForLogout();
    expect(JSON.parse(x.map.get(key)!).drafts).toHaveLength(0);
    const b = x.create();
    await b.restore();
    await b.createDraft(base);
    await b.edit(base.id, (d) => ({ ...d, name: "Mi edición" }));
    await b.createDraft({ ...base, name: "Servidor", revision: 3 });
    expect(b.getSnapshot().drafts[0]).toMatchObject({ name: "Mi edición", baseRevision: 2 });
  });
  it("confirmación remota seguida de cuota conserva intento para reconciliar, sin duplicar", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    await a.edit(draftId, (d) => ({ ...d, name: "A" }));
    const original = vi.mocked(x.storage.compareAndSet).getMockImplementation()!;
    vi.mocked(x.storage.compareAndSet).mockImplementation(async (k, b, v) => {
      const doc = JSON.parse(v);
      if (doc.pending === null && doc.drafts.length === 0) throw Error("quota");
      await original(k, b, v);
    });
    await expect(a.saveDraft(draftId)).rejects.toThrow();
    expect(a.getSnapshot().pending).not.toBeNull();
    expect(a.getSnapshot().dirty).toBe(true);
    expect(x.save).toHaveBeenCalledOnce();
    vi.mocked(x.storage.compareAndSet).mockImplementation(async (k, b, v) => {
      if ((x.map.get(k) ?? null) !== b) throw new AtomicStoreError("conflict");
      x.map.set(k, v);
    });
    await a.retryPending();
    expect(x.save.mock.calls[1][0]).toEqual(x.save.mock.calls[0][0]);
    expect(a.getSnapshot().pending).toBeNull();
  });
  it("un intento de carpeta perdido conserva petición y no necesita un borrador ficticio", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const input: PersonalMutation = {
      version: 1,
      requestId: id(1),
      targetId: id(2),
      operation: "folder_create",
      expectedRevision: 0,
      data: { name: "Fuerza" },
    };
    x.save.mockRejectedValueOnce(Error("network"));
    await expect(a.mutate(input)).rejects.toThrow();
    const b = x.create();
    await b.restore();
    await b.retryPending();
    expect(x.save.mock.calls[1][0]).toEqual(input);
    expect(b.getSnapshot().drafts).toHaveLength(0);
  });

  it("recupera varios formularios por cuenta sin aceptar datos ajenos", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const first = await a.createDraft();
    await a.edit(first, (d) => ({ ...d, name: "Superior" }));
    const second = await a.createDraft();
    await a.edit(second, (d) => ({ ...d, name: "Piernas" }));
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().drafts.map((d) => d.name)).toEqual(["Superior", "Piernas"]);
    const other = x.create(id(901));
    await other.restore();
    expect(other.getSnapshot().drafts).toHaveLength(0);
    await expect(b.clearForLogout()).rejects.toThrow();
  });
  it("cuota conserva texto intermedio y no envía sin protección local confirmada", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.edit(draftId, (d) => ({ ...d, name: "Texto conservado" }))).rejects.toThrow();
    expect(a.getSnapshot().drafts[0].name).toBe("Texto conservado");
    expect(a.getSnapshot().dirty).toBe(true);
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.saveDraft(draftId)).rejects.toThrow();
    expect(x.save).not.toHaveBeenCalled();
    await a.retryStorage();
    expect(a.getSnapshot().dirty).toBe(false);
  });
  it("congela antes de HTTP y repite el mismo intento después de respuesta perdida y recarga", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    await a.edit(draftId, (d) => ({ ...d, name: "A" }));
    x.save.mockRejectedValueOnce(Error("respuesta perdida"));
    await expect(a.saveDraft(draftId)).rejects.toThrow();
    const attempt = x.save.mock.calls[0][0];
    expect(JSON.parse(x.map.get(key)!).pending.request).toEqual(attempt);
    const b = x.create();
    await b.restore();
    await expect(b.edit(draftId, (d) => ({ ...d, name: "Otro" }))).rejects.toThrow();
    await b.retryPending();
    expect(x.save.mock.calls[1][0]).toEqual(attempt);
    expect(b.getSnapshot().drafts).toHaveLength(0);
  });
  it("conflicto conserva borrador y exige decisión antes de nuevo intento", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    await a.edit(draftId, (d) => ({ ...d, name: "A" }));
    x.save.mockRejectedValueOnce(Object.assign(Error("Cambió"), { code: "conflict" }));
    await expect(a.saveDraft(draftId)).rejects.toThrow();
    expect(a.getSnapshot().issue).toBe("conflict");
    await expect(a.retryPending()).rejects.toThrow();
    expect(x.save).toHaveBeenCalledOnce();
    const copied = await a.forkDraft(draftId);
    expect(copied).not.toBe(draftId);
    expect(a.getSnapshot().drafts[0].baseRevision).toBeNull();
    expect(a.getSnapshot().pending).toBeNull();
  });
  it("dos ventanas no sobrescriben el mismo sobre y conservan memoria", async () => {
    const x = setup(),
      a = x.create(),
      b = x.create();
    await a.restore();
    await b.restore();
    await a.createDraft();
    await expect(b.createDraft()).rejects.toThrow();
    expect(b.getSnapshot().dirty).toBe(true);
    expect(b.getSnapshot().drafts).toHaveLength(1);
    expect(JSON.parse(x.map.get(key)!).drafts[0].id).toBe(a.getSnapshot().drafts[0].id);
  });
  it("sesión expirada retiene el intento exacto y no permite cambios hasta confirmar", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    const draftId = await a.createDraft();
    await a.edit(draftId, (d) => ({ ...d, name: "Sesión conservada" }));
    x.save.mockRejectedValueOnce(
      Object.assign(Error("Vuelve a conectar tu cuenta."), { code: "unauthorized" }),
    );
    await expect(a.saveDraft(draftId)).rejects.toThrow("Vuelve a conectar");
    const frozen = x.save.mock.calls[0][0];
    expect(a.getSnapshot().pending?.request).toEqual(frozen);
    await expect(a.edit(draftId, (d) => ({ ...d, name: "No" }))).rejects.toThrow();
    const restored = x.create();
    await restored.restore();
    expect(restored.getSnapshot().drafts[0].name).toBe("Sesión conservada");
    await restored.retryPending();
    expect(x.save.mock.calls[1][0]).toEqual(frozen);
    expect(restored.getSnapshot().pending).toBeNull();
  });
  it("formato desconocido se conserva y bloquea escritura, envío y salida", async () => {
    const x = setup();
    x.map.set(key, '{"version":99}');
    const a = x.create();
    await a.restore();
    expect(a.getSnapshot().blocked).toBe(true);
    await expect(a.createDraft()).rejects.toThrow();
    await expect(a.clearForLogout()).rejects.toThrow();
    expect(x.map.get(key)).toBe('{"version":99}');
  });
});
