import { nativeWorkoutBody } from "./personal-training";
import { describe, expect, it, vi } from "vitest";
import { TrainingController, type SaveReply } from "./training";
import { NativeWorkoutQueue, nativeSyncKey } from "./sync-queue";
import { handoffPending } from "./queue-transfer";
import { personalRoutineContext, type NativeWorkoutPayload } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import type { AtomicStorage } from "./atomic-contract";
import { DEMO_ROUTINES } from "./demo";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = `is:native-training:v1:${id(1)}`;
const now = new Date("2026-10-26T12:00:00Z");
function setup() {
  const data = new Map<string, string>();
  let n = 500;
  const storage: AtomicStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    compareAndSet: vi.fn(async (k, b, v) => {
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
    }),
  };
  const send = vi.fn(async (p: NativeWorkoutPayload): Promise<SaveReply> => ({
    version: p.version === 2 ? 2 : 1,
    ok: true,
    status: "created",
    workoutId: p.id,
  }));
  const create = () =>
    new TrainingController(
      id(1),
      storage,
      send,
      () => now,
      () => id(n++),
    );
  const start = async () => {
    const c = create();
    await c.restore();
    await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
    await c.complete(0, 0);
    return c;
  };
  const queue = () => new NativeWorkoutQueue(id(1), storage, send, () => now);
  return { data, storage, send, create, start, queue };
}
describe("cierre nativo estructurado y recuperación compatible", () => {
  it("congela documento2 en sobre3 y conserva exactamente el sobre anterior", async () => {
    const x = setup(),
      c = await x.start();
    await c.pause();
    const before = x.data.get(key)!;
    await c.finish(8, "Con pausa", { localOnly: true });
    const raw = JSON.parse(x.data.get(key)!);
    expect(raw).toMatchObject({
      version: 3,
      previousFormat: before,
      active: {
        payload: {
          version: 2,
          source: "personal",
          workout: { note: "Con pausa" },
          structure: { version: 1 },
        },
      },
    });
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(false);
    expect(b.getSnapshot().active?.payload).toEqual(raw.active.payload);
  });
  it("una respuesta perdida reenvía el mismo documento sin reconstruir objetivos o IDs", async () => {
    const x = setup(),
      c = await x.start();
    x.send.mockRejectedValueOnce(Error("respuesta perdida"));
    await expect(c.finish(null, null)).rejects.toThrow("respuesta perdida");
    const frozen = c.getSnapshot().active!.payload;
    expect(frozen).toMatchObject({ version: 2 });
    const b = x.create();
    await b.restore();
    await b.retry();
    expect(x.send.mock.calls.map((v) => v[0])).toEqual([frozen, frozen]);
    expect(b.getSnapshot().active).toBeNull();
  });
  it("la cola migra con copia del formato anterior y retira el activo tras verificar destino", async () => {
    const x = setup(),
      q = x.queue();
    await q.restore();
    await q.clearForLogout();
    const old = x.data.get(nativeSyncKey(id(1)))!;
    const c = await x.start();
    await c.finish(null, null, { localOnly: true });
    const payload = c.getSnapshot().active!.payload;
    await handoffPending(c, q);
    expect(c.getSnapshot().active).toBeNull();
    expect(JSON.parse(x.data.get(nativeSyncKey(id(1)))!)).toMatchObject({
      version: 2,
      previousFormat: old,
    });
    const restored = x.queue();
    await restored.restore();
    expect(restored.getSnapshot().blocked).toBe(false);
    expect(restored.getSnapshot().entries[0].payload).toEqual(payload);
    await restored.sync({ manual: true });
    expect(restored.getSnapshot().entries[0].phase).toBe("confirmed");
  });
  it("cuota al migrar conserva el formato anterior y el documento nuevo en memoria sin enviar", async () => {
    const x = setup(),
      c = await x.start();
    const before = x.data.get(key)!;
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(c.finish(null, null)).rejects.toThrow();
    expect(x.send).not.toHaveBeenCalled();
    expect(x.data.get(key)).toBe(before);
    expect(c.getSnapshot().active?.payload).toMatchObject({ version: 2 });
    await c.retryStorage();
    await c.retry();
    expect(x.send).toHaveBeenCalledOnce();
  });
  it("un documento nuevo bajo un sobre anterior y una copia previa de otra cuenta se conservan bloqueados", async () => {
    const x = setup(),
      c = await x.start();
    await c.finish(null, null, { localOnly: true });
    const raw = JSON.parse(x.data.get(key)!);
    for (const changed of [
      { ...raw, version: 2 },
      {
        ...raw,
        version: 3,
        previousFormat: JSON.stringify({ ...JSON.parse(raw.previousFormat), userId: id(9) }),
      },
    ]) {
      const text = JSON.stringify(changed);
      x.data.set(key, text);
      const b = x.create();
      await b.restore();
      expect(b.getSnapshot().blocked).toBe(true);
      expect(x.data.get(key)).toBe(text);
    }
  });
  it("el cierre nuevo no acepta una confirmación antigua en envío directo ni en cola", async () => {
    const x = setup(),
      c = await x.start();
    x.send.mockImplementation(async (p) => ({
      version: 1,
      ok: true,
      status: "created",
      workoutId: p.id,
    }));
    await expect(c.finish(null, null)).rejects.toThrow();
    expect(c.getSnapshot().active).not.toBeNull();
    const q = x.queue();
    await q.restore();
    await handoffPending(c, q);
    await q.sync({ manual: true });
    expect(q.getSnapshot().entries[0]).toMatchObject({
      phase: "pending",
      error: { code: "version", blocked: true },
    });
  });
  it("las demos conservan cuerpo anterior, formato y ausencia de envío", async () => {
    const x = setup(),
      c = x.create();
    await c.restore();
    await c.start(DEMO_ROUTINES[0], "demo");
    c.edit((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) =>
        i ? e : { ...e, sets: e.sets.map((s, j) => (j ? s : { ...s, weight: "20", reps: "8" })) },
      ),
    }));
    await c.complete(0, 0);
    await c.finish(null, null);
    expect(x.send).not.toHaveBeenCalled();
    expect(JSON.parse(x.data.get(key)!).version).toBe(1);
  });
  it.each(["personal", "assigned"] as const)(
    "un cierre %s legado conserva cuerpo/ruta de envío al recuperar",
    async (source) => {
      const x = setup();
      let c: TrainingController;
      if (source === "personal") c = await x.start();
      else {
        c = x.create();
        await c.restore();
        await c.start(DEMO_ROUTINES[0], "real");
        c.edit((d) => ({
          ...d,
          exercises: d.exercises.map((e, i) =>
            i
              ? e
              : { ...e, sets: e.sets.map((s, j) => (j ? s : { ...s, weight: "20", reps: "8" })) },
          ),
        }));
        await c.complete(0, 0);
      }
      await c.finish(7, "Legado", { localOnly: true });
      const raw = JSON.parse(x.data.get(key)!);
      const legacy = nativeWorkoutBody(c.getSnapshot().active!.payload!);
      raw.version = 1;
      delete raw.previousFormat;
      raw.active.payload = legacy;
      const encoded = JSON.stringify(raw);
      x.data.set(key, encoded);
      const recovered = x.create();
      await recovered.restore();
      expect(recovered.getSnapshot().blocked).toBe(false);
      expect(x.data.get(key)).toBe(encoded);
      await recovered.retry();
      expect(x.send).toHaveBeenCalledWith(legacy);
      expect(x.send.mock.calls[0][0]).not.toHaveProperty("structure");
    },
  );
  it("conserva un cierre legado en la cola al añadir el documento nuevo", async () => {
    const x = setup(),
      c = await x.start();
    await c.finish(null, null, { localOnly: true });
    const document = c.getSnapshot().active!.payload!;
    const legacy = { ...nativeWorkoutBody(document), id: id(900) };
    const q = x.queue();
    await q.restore();
    await q.enqueue({ userId: id(1), title: "Anterior", payload: legacy });
    const before = x.data.get(nativeSyncKey(id(1)))!;
    await handoffPending(c, q);
    const raw = JSON.parse(x.data.get(nativeSyncKey(id(1)))!);
    expect(raw.previousFormat).toBe(before);
    expect(raw.entries[0].payload).toEqual(legacy);
    const recovered = x.queue();
    await recovered.restore();
    await recovered.sync({ manual: true });
    expect(x.send.mock.calls.map((call) => call[0])).toEqual([legacy, document]);
    expect(recovered.getSnapshot().entries.every((e) => e.phase === "confirmed")).toBe(true);
  });
  it("perder la relectura del sobre3 conserva dentro de él la copia anterior y permite recuperar", async () => {
    const x = setup(),
      c = await x.start(),
      before = x.data.get(key)!;
    const original = x.storage.get;
    let fail = true;
    vi.spyOn(x.storage, "get").mockImplementation(async (k) => {
      const value = await original(k);
      if (k === key && value && JSON.parse(value).version === 3 && fail) {
        fail = false;
        throw Error("readback");
      }
      return value;
    });
    await expect(c.finish(null, null)).rejects.toThrow();
    expect(x.send).not.toHaveBeenCalled();
    expect(JSON.parse(x.data.get(key)!).previousFormat).toBe(before);
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().blocked).toBe(false);
    await recovered.retry();
    expect(recovered.getSnapshot().active).toBeNull();
  });
  it("conflicto entre ventanas conserva el otro sobre y no envía la propuesta sin proteger", async () => {
    const x = setup(),
      c = await x.start();
    const other = JSON.parse(x.data.get(key)!);
    other.active.activeIndex = (other.active.activeIndex + 1) % 2;
    const encoded = JSON.stringify(other);
    x.data.set(key, encoded);
    await expect(c.finish(null, null)).rejects.toThrow("otra ventana");
    expect(x.data.get(key)).toBe(encoded);
    expect(x.send).not.toHaveBeenCalled();
    expect(c.getSnapshot().active?.payload).toMatchObject({ version: 2 });
  });
  it("relectura fallida de cola no retira el activo; recuperarla conserva una sola entrada", async () => {
    const x = setup(),
      c = await x.start();
    await c.finish(null, null, { localOnly: true });
    const q = x.queue();
    await q.restore();
    const original = x.storage.get;
    let fail = true;
    vi.spyOn(x.storage, "get").mockImplementation(async (k) => {
      const value = await original(k);
      if (k === nativeSyncKey(id(1)) && value && JSON.parse(value).version === 2 && fail) {
        fail = false;
        throw Error("readback");
      }
      return value;
    });
    await expect(handoffPending(c, q)).rejects.toThrow();
    expect(c.getSnapshot().active).not.toBeNull();
    const recovered = x.queue();
    await recovered.restore();
    await handoffPending(c, recovered);
    expect(recovered.getSnapshot().entries).toHaveLength(1);
    expect(c.getSnapshot().active).toBeNull();
  });
  it("conserva la cola cuando su copia previa es desconocida o pertenece a otra cuenta", async () => {
    const x = setup(),
      q = x.queue();
    await q.restore();
    await q.clearForLogout();
    const c = await x.start();
    await c.finish(null, null, { localOnly: true });
    await handoffPending(c, q);
    const k = nativeSyncKey(id(1)),
      raw = JSON.parse(x.data.get(k)!);
    for (const old of [
      { version: 99, userId: id(1), entries: [] },
      { version: 1, userId: id(9), entries: [] },
    ]) {
      const encoded = JSON.stringify({ ...raw, previousFormat: JSON.stringify(old) });
      x.data.set(k, encoded);
      const recovered = x.queue();
      await recovered.restore();
      expect(recovered.getSnapshot().blocked).toBe(true);
      expect(x.data.get(k)).toBe(encoded);
    }
  });
  it("el borrador y cierre no cortan un carácter Unicode en el límite de la nota", async () => {
    const x = setup(),
      c = await x.start(),
      note = "x".repeat(499) + "💪";
    c.review("", note + "y");
    await c.flush();
    expect(c.getSnapshot().active?.review?.note).toBe(note);
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().active?.review?.note).toBe(note);
    await recovered.finish(null, note, { localOnly: true });
    expect(nativeWorkoutBody(recovered.getSnapshot().active!.payload!).note).toBe(note);
  });
  it("más de500 caracteres de nota no congela un cierre ni envía datos", async () => {
    const x = setup(),
      c = await x.start();
    await expect(c.finish(null, "💪".repeat(501))).rejects.toThrow("500");
    expect(c.getSnapshot().active?.draft.status).toBe("in_progress");
    expect(x.send).not.toHaveBeenCalled();
  });
});
