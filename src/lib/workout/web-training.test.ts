import { expect, it, vi } from "vitest";
import { assignedId as id, assignedTrainingFixture } from "@/test/fixtures/assigned-training";
import { editTypedSet } from "../../../mobile/src/lib/typed-training";
import type { QueuedWorkoutPayload } from "../../../mobile/src/lib/queued-recording";
import { createTrainingBrowserStorage } from "./training-browser";
import { trainingGuardKey } from "./training-guard";
import { WebTraining } from "./web-training";
function setup() {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  const tails = new Map<string, Promise<void>>();
  let own = true,
    count = 90;
  const adapter = createTrainingBrowserStorage(
    id(1),
    () => store,
    () => ({
      request: async (name, op) => {
        const p = (tails.get(name) ?? Promise.resolve()).then(op);
        tails.set(
          name,
          p.catch(() => {}),
        );
        await p;
      },
    }),
  );
  const send = vi.fn(async (p: QueuedWorkoutPayload) => ({
    version: 3 as const,
    ok: true as const,
    status: "created" as const,
    workoutId: p.id,
  }));
  const bridge = new WebTraining(
    id(1),
    adapter,
    send,
    () => own,
    () => new Date("2026-10-29T15:00:00Z"),
    () => id(count++),
  );
  return {
    data,
    store,
    adapter,
    send,
    bridge,
    setOwn: (value: boolean) => {
      own = value;
    },
  };
}
async function started(x: ReturnType<typeof setup>) {
  await x.bridge.restore();
  await x.bridge.perform((c) => c.startTyped(assignedTrainingFixture()));
  await x.bridge.perform((c) => c.editTyped((d) => editTypedSet(d, 0, 0, "duration", "45")));
  await x.bridge.perform((c) => c.complete(0, 0));
}
it("el cierre se copia completo antes de liberar el origen y la guarda dura hasta confirmar", async () => {
  const x = setup();
  await started(x);
  const wid = await x.bridge.finish(null, "Nota");
  expect(x.bridge.controller.getSnapshot().active).toBeNull();
  expect(x.bridge.queue.getSnapshot().entries[0]).toMatchObject({
    phase: "pending",
    payload: { id: wid, version: 3 },
  });
  expect(x.data.has(trainingGuardKey(id(1)))).toBe(true);
  await x.bridge.sync(true);
  expect(x.bridge.queue.getSnapshot().entries[0].phase).toBe("confirmed");
  expect(x.data.has(trainingGuardKey(id(1)))).toBe(false);
});
it("respuesta perdida conserva bytes y recuperar confirma sin duplicar ni cambiar el ID", async () => {
  const x = setup();
  await started(x);
  const wid = await x.bridge.finish(8, null);
  x.send.mockRejectedValueOnce(Error("network"));
  await x.bridge.sync(true);
  const frozen = JSON.stringify(x.bridge.queue.getSnapshot().entries[0].payload);
  const recovered = new WebTraining(id(1), x.adapter, x.send, () => true);
  await recovered.restore();
  await recovered.sync(true);
  expect(x.send.mock.calls.map(([p]) => JSON.stringify(p))).toEqual([frozen, frozen]);
  expect(recovered.queue.getSnapshot().entries[0]).toMatchObject({
    phase: "confirmed",
    payload: { id: wid },
  });
});
it("cuota al copiar impide liberar el cierre y reintentar conserva su contenido", async () => {
  const x = setup();
  await started(x);
  const original = x.adapter.compareAndSet;
  x.adapter.compareAndSet = async (k, b, n) => {
    if (k.includes("native-sync")) throw Error("quota");
    return original(k, b, n);
  };
  await expect(x.bridge.finish(null, null)).rejects.toThrow();
  const pending = x.bridge.controller.getSnapshot().active!;
  expect(pending.draft.status).toBe("pending_save");
  expect(x.send).not.toHaveBeenCalled();
  x.adapter.compareAndSet = original;
  await x.bridge.recover();
  await x.bridge.sync(true);
  expect(x.bridge.controller.getSnapshot().active).toBeNull();
  expect(x.bridge.queue.getSnapshot().entries[0].payload).toEqual(pending.payload);
});
it("cambiar cuenta o reservar salida impide nuevas ediciones y envíos", async () => {
  const x = setup();
  await started(x);
  const release = await x.bridge.reserve("inspect");
  await expect(x.bridge.perform((c) => c.focus(0))).rejects.toThrow();
  expect(await x.bridge.sync(true)).toBe(false);
  release();
  x.setOwn(false);
  await expect(x.bridge.perform((c) => c.focus(0))).rejects.toThrow();
  expect(await x.bridge.sync(true)).toBe(false);
  expect(x.send).not.toHaveBeenCalled();
});
it("salir sin confirmar descarte no borra el activo; descarte explícito limpia solo su cuenta", async () => {
  const x = setup();
  await started(x);
  x.data.set(`is:native-training:v1:${id(2)}`, "private");
  const keep = await x.bridge.reserve("inspect");
  keep();
  expect(x.bridge.controller.getSnapshot().active).not.toBeNull();
  const discard = await x.bridge.reserve("discard");
  discard();
  expect(x.bridge.controller.getSnapshot().active).toBeNull();
  expect(x.bridge.queue.getSnapshot().entries).toEqual([]);
  expect(x.data.get(`is:native-training:v1:${id(2)}`)).toBe("private");
  expect(x.data.has(trainingGuardKey(id(1)))).toBe(false);
});
it("formato desconocido de cola bloquea inicio y salida destructiva sin alterar bytes", async () => {
  const x = setup(),
    key = `is:native-sync:v1:${id(1)}`;
  x.data.set(key, '{"version":99}');
  await x.bridge.restore();
  await expect(x.bridge.perform((c) => c.startTyped(assignedTrainingFixture()))).rejects.toThrow();
  await expect(x.bridge.reserve("discard")).rejects.toThrow();
  expect(x.data.get(key)).toBe('{"version":99}');
});
it("la reserva espera un envío ya comenzado antes de permitir salida", async () => {
  const x = setup();
  await started(x);
  await x.bridge.finish(null, null);
  let done!: () => void;
  x.send.mockImplementationOnce(async (p) => {
    await new Promise<void>((r) => {
      done = r;
    });
    return { version: 3, ok: true, status: "created", workoutId: p.id };
  });
  const sending = x.bridge.sync(true);
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  let released = false;
  const reserve = x.bridge.reserve("inspect").then((r) => {
    released = true;
    return r;
  });
  await Promise.resolve();
  expect(released).toBe(false);
  done();
  await sending;
  const release = await reserve;
  expect(released).toBe(true);
  release();
});
it("una confirmación remota sin espacio para el recibo local conserva pendiente y comunica el error", async () => {
  const x = setup();
  await started(x);
  await x.bridge.finish(null, null);
  const before = x.data.get(`is:native-sync:v1:${id(1)}`),
    write = x.adapter.compareAndSet;
  x.adapter.compareAndSet = async (k, b, n) => {
    if (
      k.includes("native-sync") &&
      JSON.parse(n).entries.some((e: { phase: string }) => e.phase === "confirmed")
    )
      throw Error("quota");
    return write(k, b, n);
  };
  expect(await x.bridge.sync(true)).toBe(false);
  expect(x.bridge.getSnapshot().error).toBeTruthy();
  expect(x.data.get(`is:native-sync:v1:${id(1)}`)).toBe(before);
  expect(x.data.has(trainingGuardKey(id(1)))).toBe(true);
});
it("hidratación tardía usa el estado inicial del servidor aun después de recuperar un registro y su cola", async () => {
  const x = setup();
  const initialTraining = x.bridge.getInitialTraining(),
    initialQueue = x.bridge.getInitialQueue(),
    initialReservation = x.bridge.getInitialReservation();
  expect(initialTraining.ready).toBe(false);
  expect(initialQueue.entries).toEqual([]);
  await started(x);
  await x.bridge.finish(null, null);
  const release = await x.bridge.reserve("inspect");
  expect(x.bridge.queue.getSnapshot().entries).toHaveLength(1);
  expect(x.bridge.getSnapshot().reserved).toBe(true);
  expect(x.bridge.getInitialTraining()).toBe(initialTraining);
  expect(x.bridge.getInitialTraining().ready).toBe(false);
  expect(x.bridge.getInitialQueue()).toBe(initialQueue);
  expect(x.bridge.getInitialQueue().entries).toEqual([]);
  expect(x.bridge.getInitialReservation()).toBe(initialReservation);
  expect(x.bridge.getInitialReservation().reserved).toBe(false);
  release();
});
