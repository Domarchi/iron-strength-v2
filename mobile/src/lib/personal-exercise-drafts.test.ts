import { expect, it, vi } from "vitest";
import {
  PersonalExerciseDraftController,
  personalExerciseDraftKey,
} from "./personal-exercise-drafts";
import { AtomicStoreError, type AtomicStorage } from "./atomic-contract";
import type { PersonalExerciseMutation } from "../../../src/lib/mobile/personal-exercise-contracts";
const id = "a0000000-0000-4000-8000-000000000001",
  other = "b0000000-0000-4000-8000-000000000001";
const entry = {
  id: "e0000000-0000-4000-8000-000000000001",
  revision: 1,
  archivedAt: null,
  name: "Plancha",
  muscleGroup: "Core" as const,
  equipment: null,
  isBodyweight: true,
  progressionIncrementKg: 2.5,
  recordType: "duration" as const,
};
function setup() {
  let number = 10,
    full = false,
    failReadAfterWrite = false,
    loseAfterWrite = false;
  const values = new Map<string, string>();
  const storage: AtomicStorage = {
    get: async (key) => {
      if (failReadAfterWrite) {
        failReadAfterWrite = false;
        throw Error("read");
      }
      return values.get(key) ?? null;
    },
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
    compareAndSet: async (key, before, next) => {
      if (full) throw Error("quota");
      if ((values.get(key) ?? null) !== before) throw new AtomicStoreError("conflict");
      values.set(key, next);
      if (loseAfterWrite) {
        loseAfterWrite = false;
        failReadAfterWrite = true;
      }
    },
  };
  const send = vi.fn(async (input: PersonalExerciseMutation) => ({
    version: 1 as const,
    requestId: input.requestId,
    targetId: input.targetId,
    revision: input.expectedRevision + 1,
    status: (
      { create: "created", update: "updated", archive: "archived", restore: "restored" } as const
    )[input.operation],
    duplicate: false,
  }));
  const create = (user = id) =>
    new PersonalExerciseDraftController(
      user,
      storage,
      send,
      () => `d0000000-0000-4000-8000-${String(number++).padStart(12, "0")}`,
    );
  return {
    storage,
    values,
    send,
    create,
    setFull: (v: boolean) => {
      full = v;
    },
    loseRead: () => {
      failReadAfterWrite = true;
    },
    loseVerification: () => {
      loseAfterWrite = true;
    },
  };
}
it("lectura no escribe; editar/recargar conserva texto y cuenta, abrir sin editar no bloquea salida", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  expect(x.values.size).toBe(0);
  await c.open(entry);
  expect(c.getSnapshot().draft?.changed).toBe(false);
  await c.clearForLogout();
  await c.open();
  await c.edit({ name: "Mío", progressionIncrementKg: "2," });
  const a = x.create();
  await a.restore();
  expect(a.getSnapshot().draft?.values).toMatchObject({
    name: "Mío",
    progressionIncrementKg: "2,",
  });
  await expect(a.clearForLogout()).rejects.toThrow();
  const b = x.create(other);
  await b.restore();
  expect(b.getSnapshot().draft).toBeNull();
});
it("formato futuro/ajeno no se modifica; tipo e identidad de la base son inmutables", async () => {
  for (const raw of [
    JSON.stringify({ version: 9, userId: id }),
    JSON.stringify({ version: 1, userId: other, draft: null, pending: null }),
  ]) {
    const x = setup();
    x.values.set(personalExerciseDraftKey(id), raw);
    const c = x.create();
    await c.restore();
    expect(c.getSnapshot().blocked).toBe(true);
    await expect(c.open()).rejects.toThrow();
    expect(x.values.get(personalExerciseDraftKey(id))).toBe(raw);
  }
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open(entry);
  await expect(c.edit({ recordType: "weight_reps" })).rejects.toThrow();
  expect(c.getSnapshot().draft?.values.recordType).toBe("duration");
});
it("cuota conserva propuesta; guardado local incierto se relee y ningún envío sale sin protección", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  x.setFull(true);
  await expect(c.edit({ name: "Conservar" })).rejects.toThrow();
  expect(c.getSnapshot().dirty).toBe(true);
  expect(c.getSnapshot().draft?.values.name).toBe("Conservar");
  await expect(c.save()).rejects.toThrow();
  expect(x.send).not.toHaveBeenCalled();
  const request = c.getSnapshot().pending?.request;
  x.setFull(false);
  await c.retryPending();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.send.mock.calls[0][0]).toEqual(request);
  expect(c.getSnapshot().draft).toBeNull();
});
it("dos ventanas conservan ambos cambios; no se envía ni se relee sobre una propuesta sucia", async () => {
  const x = setup(),
    a = x.create(),
    b = x.create();
  await a.restore();
  await b.restore();
  await a.open();
  await a.edit({ name: "Ventana A" });
  await expect(b.open()).rejects.toThrow();
  expect(b.getSnapshot().dirty).toBe(true);
  await expect(b.restore()).rejects.toThrow();
  await expect(b.save()).rejects.toThrow();
  expect(x.send).not.toHaveBeenCalled();
  const persisted = JSON.parse(x.values.get(personalExerciseDraftKey(id))!);
  expect(persisted.draft.values.name).toBe("Ventana A");
});
it("respuesta perdida conserva cuerpo/ID tras recarga; solo confirma operación/revisión correctas", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  await c.edit({ name: "Estable" });
  x.send.mockRejectedValueOnce(Error("lost"));
  await expect(c.save()).rejects.toThrow("lost");
  const request = c.getSnapshot().pending!.request;
  const again = x.create();
  await again.restore();
  x.send.mockResolvedValueOnce({
    version: 1,
    requestId: request.requestId,
    targetId: request.targetId,
    revision: 99,
    status: "created",
    duplicate: true,
  });
  await expect(again.retryPending()).rejects.toThrow();
  expect(again.getSnapshot().pending?.request).toEqual(request);
  await again.retryPending();
  expect(x.send.mock.calls.at(-1)![0]).toEqual(request);
  expect(again.getSnapshot().pending).toBeNull();
});
it("conflicto exige snapshot propio revisado; conserva campos y permite una copia explícita de un eliminado", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open(entry);
  await c.edit({ name: "Mío" });
  x.send.mockRejectedValueOnce(Object.assign(Error("conflict"), { code: "conflict" }));
  await expect(c.save()).rejects.toThrow();
  await expect(c.retryPending()).rejects.toThrow();
  await expect(
    c.resolveConflict({ version: 1, userId: other, exercises: [entry] }),
  ).rejects.toThrow();
  await c.resolveConflict({
    version: 1,
    userId: id,
    exercises: [{ ...entry, name: "Remoto", revision: 2 }],
  });
  expect(c.getSnapshot().draft).toMatchObject({
    baseRevision: 2,
    values: { name: "Mío" },
    base: { name: "Remoto" },
  });
  await c.save();
  expect(x.send.mock.calls.at(-1)![0].expectedRevision).toBe(2);
  await c.open(entry);
  await c.edit({ name: "Copia mía" });
  x.send.mockRejectedValueOnce(Object.assign(Error("gone"), { code: "not_found" }));
  await expect(c.save()).rejects.toThrow();
  const original = c.getSnapshot().draft!.id;
  await c.forkDraft();
  expect(c.getSnapshot().draft!.id).not.toBe(original);
  expect(c.getSnapshot().draft!.base).toBeNull();
});
it("archivar/restaurar no cambia formulario, pide revisión estable y no pisa un borrador pendiente", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.archive(entry, false);
  expect(x.send.mock.calls[0][0]).toMatchObject({
    operation: "archive",
    expectedRevision: 1,
    data: {},
  });
  await c.archive({ ...entry, revision: 2, archivedAt: "2026-10-28T12:00:00Z" }, true);
  expect(x.send.mock.calls[1][0]).toMatchObject({ operation: "restore", expectedRevision: 2 });
  await c.open();
  await c.edit({ name: "Pendiente" });
  await expect(c.archive(entry, false)).rejects.toThrow();
});
it("borrado reserva escrituras antes de esperar; descarga local no recrea la clave tras limpieza", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  await c.edit({ name: "Local" });
  const release = c.pauseWrites();
  await c.flush();
  await expect(c.edit({ name: "Tarde" })).rejects.toThrow();
  await expect(c.save()).rejects.toThrow();
  x.values.delete(personalExerciseDraftKey(id));
  release();
  release();
  c.dispose();
  await expect(c.edit({ name: "Después" })).rejects.toThrow();
  expect(x.values.has(personalExerciseDraftKey(id))).toBe(false);
});
it("respuesta de envío posterior a dispose no retira ni recrea contenido; descarte exige confirmación", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  await c.edit({ name: "Original" });
  let release!: (v: Awaited<ReturnType<typeof x.send>>) => void;
  x.send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = c.save();
  await vi.waitFor(() => expect(x.send).toHaveBeenCalledTimes(1));
  const frozen = c.getSnapshot().pending!.request;
  c.dispose();
  release({
    version: 1,
    requestId: frozen.requestId,
    targetId: frozen.targetId,
    revision: 1,
    status: "created",
    duplicate: false,
  });
  await expect(pending).rejects.toThrow();
  const again = x.create();
  await again.restore();
  expect(again.getSnapshot().pending).not.toBeNull();
  await expect(again.discard()).rejects.toThrow();
  await again.discard(true);
  expect(again.getSnapshot().pending).toBeNull();
});
it("relectura local perdida conserva el intento y reintenta los mismos IDs antes de enviar", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  await c.edit({ name: "Verificar" });
  x.loseVerification();
  await expect(c.save()).rejects.toThrow();
  expect(x.send).not.toHaveBeenCalled();
  const frozen = c.getSnapshot().pending!.request;
  await c.retryPending();
  expect(x.send.mock.calls[0][0]).toEqual(frozen);
  expect(c.getSnapshot().dirty).toBe(false);
});
it("edición rápida guarda todos los valores antes de desmontar y bloquea una lectura inicial retenida", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  const id = c.getSnapshot().draft!.id;
  const writes = ["P", "Pl", "Plan", "Plancha rápida"].map((name) => c.edit({ name }));
  c.dispose();
  await Promise.all(writes);
  const again = x.create();
  await again.restore();
  expect(again.getSnapshot().draft).toMatchObject({ id, values: { name: "Plancha rápida" } });
  let resume!: () => void;
  const read = x.storage.get;
  x.storage.get = async (k) => {
    await new Promise<void>((resolve) => {
      resume = resolve;
    });
    return read(k);
  };
  const b = x.create(other),
    loading = b.restore();
  expect(() => b.pauseWrites()).toThrow();
  resume();
  await loading;
  expect(b.getSnapshot().ready).toBe(true);
});
it("reserva adquirida durante una escritura espera su vaciado e impide recrear datos tras limpieza", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  const cas = x.storage.compareAndSet;
  let resume!: () => void;
  x.storage.compareAndSet = async (...args) => {
    await new Promise<void>((resolve) => {
      resume = resolve;
    });
    return cas(...args);
  };
  const editing = c.edit({ name: "En vuelo" });
  await vi.waitFor(() => expect(resume).toBeTypeOf("function"));
  const release = c.pauseWrites();
  let flushed = false;
  const waiting = c.flush().then(() => {
    flushed = true;
  });
  expect(flushed).toBe(false);
  await expect(c.edit({ name: "Tarde" })).rejects.toThrow();
  resume();
  await editing;
  await waiting;
  expect(flushed).toBe(true);
  x.values.delete(personalExerciseDraftKey(id));
  c.dispose();
  release();
  await expect(c.save()).rejects.toThrow();
  expect(x.values.has(personalExerciseDraftKey(id))).toBe(false);
});
it("confirmación de otra operación nunca retira el formulario", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.open();
  await c.edit({ name: "Conservar" });
  x.send.mockImplementationOnce(async (input) => ({
    version: 1,
    requestId: input.requestId,
    targetId: input.targetId,
    revision: 1,
    status: "updated",
    duplicate: false,
  }));
  await expect(c.save()).rejects.toThrow();
  expect(c.getSnapshot().draft?.values.name).toBe("Conservar");
  expect(c.getSnapshot().pending).not.toBeNull();
});
for (const afterWait of [false, true]) {
  it(`salida de una generación desmontada no recrea una clave vacía · espera ${afterWait}`, async () => {
    const x = setup(),
      c = x.create();
    await c.restore();
    const release = c.pauseWrites();
    let resume!: () => void;
    if (afterWait) {
      const flush = c.flush.bind(c);
      c.flush = async () => {
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
        return flush();
      };
    }
    let request: Promise<void>;
    if (afterWait) {
      request = c.clearForLogout();
      await vi.waitFor(() => expect(resume).toBeTypeOf("function"));
      c.dispose();
      resume();
    } else {
      c.dispose();
      request = c.clearForLogout();
    }
    await expect(request).rejects.toThrow();
    release();
    expect(x.values.has(personalExerciseDraftKey(id))).toBe(false);
  });
}
it("salida retenida en la relectura no escribe si la generación se desmonta antes del CAS", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  const release = c.pauseWrites();
  const read = x.storage.get;
  let resume!: () => void,
    block = true;
  x.storage.get = async (key) => {
    if (block) {
      block = false;
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    }
    return read(key);
  };
  const pending = c.clearForLogout();
  await vi.waitFor(() => expect(resume).toBeTypeOf("function"));
  c.dispose();
  resume();
  await expect(pending).rejects.toThrow();
  release();
  expect(x.values.has(personalExerciseDraftKey(id))).toBe(false);
});
