import { expect, it, vi } from "vitest";
import { assignedId as id, assignedTrainingFixture } from "@/test/fixtures/assigned-training";
import { TrainingController } from "../../../mobile/src/lib/training";
import { editTypedSet } from "../../../mobile/src/lib/typed-training";
import type { QueuedWorkoutPayload } from "../../../mobile/src/lib/queued-recording";
import { hasLocalTraining } from "../offline/local-account";
import { createTrainingBrowserStorage } from "./training-browser";
import { trainingGuardKey } from "./training-guard";
const owner = id(1),
  key = `is:native-training:v1:${owner}`;
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k);
    }),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  let tail = Promise.resolve();
  const locks = {
    request: vi.fn(async (_name: string, operation: () => void) => {
      const next = tail.then(operation);
      tail = next.catch(() => {});
      await next;
    }),
  };
  const adapter = createTrainingBrowserStorage(
    owner,
    () => storage,
    () => locks,
  );
  const send = vi.fn(async (payload: QueuedWorkoutPayload) => {
    throw Error(`response lost: ${payload.id}`);
  });
  const controller = new TrainingController(
    owner,
    adapter,
    send,
    () => new Date("2026-10-29T15:00:00Z"),
    () => id(99),
  );
  return { data, storage, locks, adapter, send, controller };
}
async function started(x: ReturnType<typeof setup>) {
  await x.controller.restore();
  await x.controller.startTyped(assignedTrainingFixture());
}
it("es lazy y protege un registro real con la guarda que ve el worker anterior", async () => {
  const x = setup();
  expect(x.storage.getItem).not.toHaveBeenCalled();
  await started(x);
  expect(x.data.has(trainingGuardKey(owner))).toBe(true);
  expect(hasLocalTraining(x.storage)).toBe(true);
  expect(
    x.locks.request.mock.calls.every(([name]) => name === `iron-strength-native-week:${key}`),
  ).toBe(true);
  expect(x.controller.getSnapshot()).toMatchObject({
    dirty: false,
    active: { draft: { version: 4 } },
  });
  x.controller.editTyped((d) => editTypedSet(d, 0, 0, "duration", "62,"));
  await x.controller.flush();
  const recovered = new TrainingController(owner, x.adapter, x.send);
  await recovered.restore();
  expect(recovered.getSnapshot().active?.draft.exercises[0].sets[0]).toMatchObject({
    duration: "62,",
  });
});
it("dos ventanas conservan la primera escritura y la segunda queda pendiente, sin envío", async () => {
  const x = setup(),
    other = new TrainingController(
      owner,
      x.adapter,
      x.send,
      () => new Date("2026-10-29T15:00:00Z"),
      () => id(100),
    );
  await Promise.all([x.controller.restore(), other.restore()]);
  const outcomes = await Promise.allSettled([
    x.controller.startTyped(assignedTrainingFixture()),
    other.startTyped(assignedTrainingFixture()),
  ]);
  expect(outcomes.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(other.getSnapshot()).toMatchObject({ dirty: true });
  expect(JSON.parse(x.data.get(key)!).active.draft.workoutId).toBe(id(99));
  expect(x.send).not.toHaveBeenCalled();
});
it("sin locks, con guarda desconocida o borrador anterior propio no escribe el activo", async () => {
  for (const conflict of ["locks", "guard", "legacy"] as const) {
    const x = setup();
    if (conflict === "guard") x.data.set(trainingGuardKey(owner), "unknown");
    if (conflict === "legacy") x.data.set(`is:draft:v99:${owner}:${id(3)}`, "future");
    const adapter =
      conflict === "locks"
        ? createTrainingBrowserStorage(
            owner,
            () => x.storage,
            () => undefined,
          )
        : x.adapter;
    const controller = new TrainingController(
      owner,
      adapter,
      x.send,
      () => new Date("2026-10-29T15:00:00Z"),
      () => id(99),
    );
    await controller.restore();
    await expect(controller.startTyped(assignedTrainingFixture())).rejects.toThrow();
    expect(x.data.has(key)).toBe(false);
    expect(x.send).not.toHaveBeenCalled();
    if (conflict === "guard") {
      expect(x.data.get(trainingGuardKey(owner))).toBe("unknown");
      expect(controller.getSnapshot().blocked).toBe(true);
    }
    if (conflict === "legacy") expect(x.data.get(`is:draft:v99:${owner}:${id(3)}`)).toBe("future");
  }
});
it("cuota o relectura de la guarda impiden escribir el registro; se recupera el intento exacto", async () => {
  const x = setup();
  x.storage.setItem.mockImplementationOnce(() => {
    throw Error("quota");
  });
  await expect(started(x)).rejects.toThrow();
  expect(x.data.has(key)).toBe(false);
  expect(x.controller.getSnapshot().dirty).toBe(true);
  await x.controller.retryStorage();
  const raw = x.data.get(key);
  expect(JSON.parse(raw!).active.draft.workoutId).toBe(id(99));
  const y = setup();
  y.storage.setItem.mockImplementationOnce(() => {});
  await expect(started(y)).rejects.toThrow();
  expect(y.data.has(key)).toBe(false);
});
it("un fallo del activo conserva la guarda y el borrador en memoria, sin tocar otras cuentas", async () => {
  const x = setup();
  x.data.set(`is:draft:v99:${id(90)}:s`, "private");
  x.storage.setItem.mockImplementation((k, v) => {
    if (k === key) throw Error("quota");
    x.data.set(k, v);
  });
  await expect(started(x)).rejects.toThrow();
  expect(x.data.has(trainingGuardKey(owner))).toBe(true);
  expect(x.data.get(`is:draft:v99:${id(90)}:s`)).toBe("private");
  expect(x.send).not.toHaveBeenCalled();
});
it("una respuesta perdida conserva cierre3 idéntico, guarda y objetivo; confirmar lo retira", async () => {
  const x = setup();
  await started(x);
  x.controller.editTyped((d) => editTypedSet(d, 0, 0, "duration", "45"));
  await x.controller.flush();
  await x.controller.complete(0, 0);
  await expect(x.controller.finish(8, "Controlado")).rejects.toThrow("response lost");
  const raw = x.data.get(key)!,
    first = x.send.mock.calls[0]?.[0];
  expect(x.data.has(trainingGuardKey(owner))).toBe(true);
  const send = vi.fn(async (payload: { id: string }) => ({
    version: 3 as const,
    ok: true as const,
    status: "duplicate" as const,
    workoutId: payload.id,
  }));
  const recovered = new TrainingController(owner, x.adapter, send);
  await recovered.restore();
  expect(x.data.get(key)).toBe(raw);
  expect(await recovered.retry()).toMatchObject({ id: id(99), mode: "real" });
  expect(send).toHaveBeenCalledWith(first);
  expect(x.data.has(trainingGuardKey(owner))).toBe(false);
  expect(hasLocalTraining(x.storage)).toBe(false);
  expect(recovered.getSnapshot().active).toBeNull();
});
it("conserva formatos futuros y rechaza escrituras o retiros fuera de la cuenta capturada", async () => {
  const x = setup();
  x.data.set(key, '{"version":99}');
  await x.controller.restore();
  expect(x.controller.getSnapshot().blocked).toBe(true);
  expect(x.data.get(key)).toBe('{"version":99}');
  await expect(x.adapter.compareAndSet(key, '{"version":99}', "{}")).rejects.toThrow();
  await expect(x.adapter.remove(key)).rejects.toThrow();
  await expect(x.adapter.get(`is:native-training:v1:${id(90)}`)).rejects.toThrow();
  expect(x.data.get(key)).toBe('{"version":99}');
});
it("retiro comparado no elimina una edición de otra ventana ni la guarda desconocida", async () => {
  const x = setup();
  await started(x);
  const before = x.data.get(key)!;
  await x.controller.discard();
  await expect(x.adapter.compareAndRemove!(key, before)).rejects.toMatchObject({
    reason: "conflict",
  });
  const empty = x.data.get(key)!;
  x.data.set(trainingGuardKey(owner), "future");
  await expect(x.adapter.compareAndRemove!(key, empty)).rejects.toThrow();
  expect(x.data.get(key)).toBe(empty);
  expect(x.data.get(trainingGuardKey(owner))).toBe("future");
});
it("un fallo al retirar la guarda no confirma limpieza; reintentar conserva el cierre", async () => {
  const x = setup();
  await started(x);
  x.storage.removeItem.mockImplementationOnce(() => {});
  await expect(x.controller.discard()).rejects.toThrow();
  expect(x.controller.getSnapshot().dirty).toBe(true);
  expect(x.data.has(trainingGuardKey(owner))).toBe(true);
  // The controller keeps its original active after an uncertain discard. It can protect it again.
  await x.controller.retryStorage();
  expect(JSON.parse(x.data.get(key)!).active.draft.workoutId).toBe(id(99));
  await x.controller.discard();
  await x.controller.clearForLogout();
  expect(x.data.has(key)).toBe(false);
  expect(x.data.has(trainingGuardKey(owner))).toBe(false);
});
it("clearForLogout usa comparación para no retirar un documento cambiado tras flush", async () => {
  const x = setup();
  await started(x);
  await x.controller.discard();
  const empty = x.data.get(key)!;
  const remove = x.adapter.compareAndRemove.bind(x.adapter);
  x.adapter.compareAndRemove = async (k, before) => {
    x.data.set(k, '{"version":99}');
    return remove(k, before);
  };
  await expect(x.controller.clearForLogout()).rejects.toMatchObject({ reason: "conflict" });
  expect(x.data.get(key)).toBe('{"version":99}');
  expect(x.data.get(key)).not.toBe(empty);
});
