import { expect, it, vi } from "vitest";
import { NativeWorkoutQueue, nativeSyncKey } from "./sync-queue";
import { handoffPending } from "./queue-transfer";
import { typedRecordingFixture } from "../../../src/test/fixtures/typed-recording";
import { recordingFixture } from "../../../src/test/fixtures/workout-recording";
import type { AtomicStorage } from "./atomic-contract";
import {
  type QueuedWorkoutPayload,
  type QueuedSaveReply,
  queuedPayloadBody,
  sendQueuedRecording,
} from "./queued-recording";
import { MobileError } from "./client";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const now = () => new Date("2026-10-27T12:00:00Z");
function setup() {
  const map = new Map<string, string>();
  const store: AtomicStorage = {
    get: vi.fn(async (k) => map.get(k) ?? null),
    set: vi.fn(async (k, v) => {
      map.set(k, v);
    }),
    remove: vi.fn(async (k) => {
      map.delete(k);
    }),
    compareAndSet: vi.fn(async (k, b, v) => {
      if ((map.get(k) ?? null) !== b) throw Error("conflict");
      map.set(k, v);
    }),
  };
  const send = vi.fn(async (p: QueuedWorkoutPayload): Promise<QueuedSaveReply> => ({
    version: p.version === 3 ? 3 : p.version === 2 ? 2 : 1,
    ok: true,
    status: "created",
    workoutId: p.id,
  }));
  const create = (owner = user) => new NativeWorkoutQueue(owner, store, send, now);
  return { map, store, send, create, key: nativeSyncKey(user) };
}
function typed() {
  const p = typedRecordingFixture();
  p.id = "ac215000-0000-4000-8000-000000000999";
  p.workout.id = p.id;
  return p;
}
it.each([false, true])(
  "migra sobre anterior al agregar3 conservando cuerpos y copia exacta: formato2=%s",
  async (structured) => {
    const x = setup(),
      q = x.create();
    await q.restore();
    const old = recordingFixture();
    await q.enqueue({ userId: user, title: "Anterior", payload: structured ? old : old.workout });
    const before = x.map.get(x.key)!;
    expect(JSON.parse(before).version).toBe(structured ? 2 : 1);
    const p = typed();
    await q.enqueue({ userId: user, title: "Nuevo", payload: p });
    const encoded = x.map.get(x.key)!;
    expect(JSON.parse(encoded)).toMatchObject({ version: 3, previousFormat: before });
    const restored = x.create();
    await restored.restore();
    expect(restored.getSnapshot().blocked).toBe(false);
    expect(x.map.get(x.key)).toBe(encoded);
    expect(restored.getSnapshot().entries.map((e) => e.payload)).toEqual([
      structured ? old : old.workout,
      p,
    ]);
    await restored.sync({ manual: true });
    expect(x.send.mock.calls.map((c) => c[0])).toEqual([structured ? old : old.workout, p]);
    expect(restored.getSnapshot().entries.every((e) => e.phase === "confirmed")).toBe(true);
  },
);
it("documento3 bajo sobres1/2 y versiones desconocidas se conservan bloqueados, incluso al salir", async () => {
  const x = setup(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Nuevo", payload: typed() });
  const raw = JSON.parse(x.map.get(x.key)!);
  for (const version of [1, 2, 4]) {
    const text = JSON.stringify({ ...raw, version });
    x.map.set(x.key, text);
    const restored = x.create();
    await restored.restore();
    expect(restored.getSnapshot().blocked).toBe(true);
    await restored.clearForLogout();
    expect(x.map.get(x.key)).toBe(text);
  }
  expect(x.send).not.toHaveBeenCalled();
});
it("copia previa inválida/ajena/futura no se elimina ni se sobrescribe", async () => {
  const x = setup(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Nuevo", payload: typed() });
  const raw = JSON.parse(x.map.get(x.key)!);
  for (const previousFormat of [
    "invalid",
    JSON.stringify({ version: 1, userId: other, entries: [] }),
    JSON.stringify({ ...raw, version: 4 }),
    JSON.stringify(raw),
  ]) {
    const text = JSON.stringify({ ...raw, previousFormat });
    x.map.set(x.key, text);
    const restored = x.create();
    await restored.restore();
    expect(restored.getSnapshot().blocked).toBe(true);
    expect(x.map.get(x.key)).toBe(text);
  }
});
it("cuota al migrar conserva el sobre anterior y no retira el origen", async () => {
  const x = setup(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Anterior", payload: recordingFixture() });
  const before = x.map.get(x.key)!;
  vi.mocked(x.store.compareAndSet).mockRejectedValueOnce(Error("quota"));
  const p = typed(),
    source = {
      pendingForQueue: async () => ({ userId: user, title: "Nuevo", payload: p }),
      releaseQueued: vi.fn(async () => {}),
    };
  await expect(handoffPending(source, q)).rejects.toThrow();
  expect(source.releaseQueued).not.toHaveBeenCalled();
  expect(x.map.get(x.key)).toBe(before);
  expect(x.send).not.toHaveBeenCalled();
  const restored = x.create();
  await restored.restore();
  await handoffPending(source, restored);
  expect(source.releaseQueued).toHaveBeenCalledWith(p.id, p);
});
it("pérdida de relectura conserva la copia previa y ambas fuentes; recuperar no duplica la entrada", async () => {
  const x = setup(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Anterior", payload: recordingFixture() });
  const before = x.map.get(x.key)!;
  const get = async (key: string) => x.map.get(key) ?? null;
  let fail = true;
  vi.mocked(x.store.get).mockImplementation(async (k) => {
    const v = await get(k);
    if (v && JSON.parse(v).version === 3 && fail) {
      fail = false;
      throw Error("readback");
    }
    return v;
  });
  const p = typed(),
    source = {
      pendingForQueue: async () => ({ userId: user, title: "Nuevo", payload: p }),
      releaseQueued: vi.fn(async () => {}),
    };
  await expect(handoffPending(source, q)).rejects.toThrow();
  expect(source.releaseQueued).not.toHaveBeenCalled();
  expect(JSON.parse(x.map.get(x.key)!).previousFormat).toBe(before);
  const restored = x.create();
  await restored.restore();
  await handoffPending(source, restored);
  expect(restored.getSnapshot().entries).toHaveLength(2);
  expect(source.releaseQueued).toHaveBeenCalledOnce();
});
it("otro escritor impide retirar el origen y conserva su cola; cuenta ajena no se transfiere", async () => {
  const x = setup(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Anterior", payload: recordingFixture() });
  const otherWindow = x.create();
  await otherWindow.restore();
  await otherWindow.discard(recordingFixture().id);
  const before = x.map.get(x.key)!;
  const p = typed(),
    source = {
      pendingForQueue: async () => ({ userId: user, title: "Nuevo", payload: p }),
      releaseQueued: vi.fn(async () => {}),
    };
  await expect(handoffPending(source, q)).rejects.toThrow();
  expect(source.releaseQueued).not.toHaveBeenCalled();
  expect(x.map.get(x.key)).toBe(before);
  const wrong = x.create(other);
  await wrong.restore();
  await expect(handoffPending(source, wrong)).rejects.toThrow();
  expect(source.releaseQueued).not.toHaveBeenCalled();
});
it("confirmación antigua/ID ajeno no confirma3 y el mismo documento se recupera tras perder respuesta", async () => {
  const x = setup(),
    q = x.create(),
    p = typed();
  await q.restore();
  await q.enqueue({ userId: user, title: "Nuevo", payload: p });
  for (const reply of [
    { version: 2 as const, ok: true as const, status: "created" as const, workoutId: p.id },
    { version: 3 as const, ok: true as const, status: "created" as const, workoutId: other },
  ]) {
    x.send.mockResolvedValueOnce(reply);
    await q.sync({ manual: true });
    expect(q.getSnapshot().entries[0].phase).toBe("pending");
  }
  x.send.mockRejectedValueOnce(new MobileError("network", "Conexión perdida"));
  await q.sync({ manual: true });
  const restored = x.create();
  await restored.restore();
  x.send.mockResolvedValueOnce({ version: 3, ok: true, status: "duplicate", workoutId: p.id });
  await restored.sync({ manual: true });
  expect(restored.getSnapshot().entries[0].phase).toBe("confirmed");
  expect(x.send.mock.calls.every((c) => JSON.stringify(c[0]) === JSON.stringify(p))).toBe(true);
});
it("el mismo ID con contenido diferente no se combina ni se envía automáticamente", async () => {
  const x = setup(),
    q = x.create(),
    p = typed();
  await q.restore();
  await q.enqueue({ userId: user, title: "Nuevo", payload: p });
  const changed = structuredClone(p);
  changed.workout.exerciseNotes[0].note = "Otra nota";
  await expect(q.enqueue({ userId: user, title: "Nuevo", payload: changed })).rejects.toThrow();
  await q.sync();
  expect(x.send).not.toHaveBeenCalled();
  expect(q.getSnapshot().entries[0].payload).toEqual(p);
});
it("salir exige resolver pendientes3 y limpiar una cuenta no modifica la otra", async () => {
  const x = setup(),
    q = x.create(),
    p = typed();
  await q.restore();
  await q.enqueue({ userId: user, title: "Nuevo", payload: p });
  x.map.set(nativeSyncKey(other), "preservar");
  await expect(q.clearForLogout()).rejects.toThrow();
  await q.discard(p.id);
  await q.clearForLogout();
  expect(JSON.parse(x.map.get(x.key)!).entries).toEqual([]);
  expect(x.map.get(nativeSyncKey(other))).toBe("preservar");
});
it("despacha cada documento a su ruta y muestra solo la cabecera sin interpretar métricas como reps", async () => {
  const response = { ok: true as const, status: "created" as const, workoutId: typed().id };
  const client = {
    saveTypedRecording: vi.fn(async () => ({ ...response, version: 3 as const })),
    saveRecording: vi.fn(async () => ({ ...response, version: 2 as const })),
    savePersonalWorkout: vi.fn(async () => ({ ...response, version: 1 as const })),
    saveWorkout: vi.fn(async () => ({ ...response, version: 1 as const })),
  };
  const p = typed(),
    old = recordingFixture("personal"),
    assigned = recordingFixture("assigned");
  for (const value of [p, old, old.workout, assigned.workout])
    await sendQueuedRecording(client, value, user);
  expect(client.saveTypedRecording).toHaveBeenCalledWith(p, user);
  expect(client.saveRecording).toHaveBeenCalledWith(old, user);
  expect(client.savePersonalWorkout).toHaveBeenCalledWith(old.workout, user);
  expect(client.saveWorkout).toHaveBeenCalledWith(assigned.workout, user);
  expect(queuedPayloadBody(p)).toEqual(p.workout);
  expect(queuedPayloadBody(assigned.workout)).toEqual(assigned.workout);
});
