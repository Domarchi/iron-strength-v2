import { nativeWorkoutBody } from "./personal-training";
import { describe, expect, it, vi } from "vitest";
import { TrainingController } from "./training";
import type { AtomicStorage } from "./atomic-contract";
import { DEMO_ROUTINES } from "./demo";
import { personalRoutineContext, type NativeWorkoutPayload } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import { updateSetField } from "../../../src/lib/workout/runner-state";
const user = "af214000-0000-4000-8000-000000000001";
const key = `is:native-training:v1:${user}`;
function setup() {
  const values = new Map<string, string>();
  const clock = { now: Date.parse("2026-10-26T12:00:00Z") };
  const storage: AtomicStorage = {
    get: vi.fn(async (k) => values.get(k) ?? null),
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
    compareAndSet: vi.fn(async (k, before, next) => {
      if ((values.get(k) ?? null) !== before) throw Error("El registro cambió en otra ventana.");
      values.set(k, next);
    }),
  };
  const send = vi.fn(async (p: NativeWorkoutPayload) => ({
    version: (p.version === 2 ? 2 : 1) as 1 | 2,
    ok: true as const,
    status: "created" as const,
    workoutId: p.id,
  }));
  const create = () =>
    new TrainingController(
      user,
      storage,
      send,
      () => new Date(clock.now),
      () => user,
    );
  async function start(kind: "assigned" | "personal") {
    const a = create();
    await a.restore();
    if (kind === "assigned") await a.start(DEMO_ROUTINES[0], "real");
    else await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
    a.edit((d) => updateSetField(d, 0, 0, "weight", "30"));
    await a.flush();
    await a.complete(0, 0);
    if (kind === "personal") await a.complete(1, 0);
    return a;
  }
  return { values, clock, storage, send, create, start };
}
describe("pausa nativa protege duración y formato anterior", () => {
  it.each(["assigned", "personal"] as const)(
    "%s: pausa recuperable conserva inicio/rest y cierre neto congelado",
    async (kind) => {
      const x = setup(),
        a = await x.start(kind),
        original = x.values.get(key)!;
      const startedAt = a.getSnapshot().active!.draft.startedAt;
      const rest = a.getSnapshot().active!.draft.rest;
      x.clock.now += 5500;
      await a.pause();
      const migrated = JSON.parse(x.values.get(key)!);
      expect(migrated.version).toBe(2);
      expect(migrated.previousFormat).toBe(original);
      await a.pause();
      x.clock.now += 60000;
      const b = x.create();
      await b.restore();
      expect(b.getSnapshot().blocked).toBe(false);
      expect(b.getSnapshot().active?.pause?.pausedAtMs).toBe(Date.parse(startedAt) + 5500);
      expect(b.getSnapshot().active?.draft.rest).toEqual(rest);
      await expect(b.complete(0, 1)).rejects.toThrow("pausa");
      expect(() => b.edit((d) => updateSetField(d, 0, 1, "weight", "99"))).toThrow("pausa");
      await b.resume();
      x.clock.now += 10000;
      await b.pause();
      x.clock.now += 20000;
      expect(b.getSnapshot().active?.draft.rest).toEqual(rest);
      await b.finish(null, null, { localOnly: true });
      const frozen = b.getSnapshot().active!.payload!;
      expect(nativeWorkoutBody(frozen)).toMatchObject({
        startedAt,
        durationSeconds: 15,
        finishedAt: new Date(x.clock.now).toISOString(),
      });
      expect(b.getSnapshot().active?.draft.rest).toBeNull();
      x.send.mockRejectedValueOnce(Error("respuesta perdida"));
      await expect(b.retry()).rejects.toThrow();
      const c = x.create();
      await c.restore();
      await expect(c.pause()).rejects.toThrow();
      await c.retry();
      expect(x.send.mock.calls[0][0]).toEqual(frozen);
      expect(x.send.mock.calls[1][0]).toEqual(frozen);
      expect(JSON.parse(x.values.get(key)!)).not.toHaveProperty("previousFormat");
    },
  );
  it("cuota conserva versión1 intacta, pausa en memoria y reintento del mismo formato", async () => {
    const x = setup(),
      a = await x.start("personal"),
      before = x.values.get(key)!;
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.pause()).rejects.toThrow();
    expect(x.values.get(key)).toBe(before);
    expect(a.getSnapshot().dirty).toBe(true);
    expect(a.getSnapshot().active?.pause?.pausedAtMs).toBe(x.clock.now);
    await a.retryStorage();
    expect(JSON.parse(x.values.get(key)!).previousFormat).toBe(before);
    expect(x.send).not.toHaveBeenCalled();
  });
  it("fallar relectura conserva ambas versiones y otra apertura recupera la pausa", async () => {
    const x = setup(),
      a = await x.start("assigned"),
      before = x.values.get(key)!;
    const original = x.storage.compareAndSet;
    vi.mocked(x.storage.compareAndSet).mockImplementationOnce(async (k, b, n) => {
      await original(k, b, n);
      vi.mocked(x.storage.get).mockRejectedValueOnce(Error("readback"));
    });
    await expect(a.pause()).rejects.toThrow();
    expect(JSON.parse(x.values.get(key)!).previousFormat).toBe(before);
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(false);
    expect(b.getSnapshot().active?.pause?.pausedAtMs).toBe(x.clock.now);
  });
  it("dos ventanas no sobrescriben la migración confirmada de la otra", async () => {
    const x = setup(),
      a = await x.start("personal"),
      b = x.create();
    await b.restore();
    await a.pause();
    const protectedRaw = x.values.get(key);
    x.clock.now += 1000;
    await expect(b.pause()).rejects.toThrow("otra ventana");
    expect(x.values.get(key)).toBe(protectedRaw);
    expect(b.getSnapshot().active?.pause?.pausedAtMs).toBe(x.clock.now);
    expect(b.getSnapshot().dirty).toBe(true);
  });
  it.each(["json", "version", "user", "workout", "owner"])(
    "copia previa incompatible (%s) se conserva y bloquea, sin normalizarla",
    async (field) => {
      const x = setup(),
        a = await x.start("assigned");
      await a.pause();
      const record = JSON.parse(x.values.get(key)!);
      const previous = JSON.parse(record.previousFormat);
      const other = "af214000-0000-4000-8000-000000000099";
      if (field === "user") previous.userId = other;
      if (field === "workout") previous.active.draft.workoutId = other;
      if (field === "owner") previous.active.draft.userId = other;
      record.previousFormat =
        field === "json"
          ? "{invalid}"
          : field === "version"
            ? '{"version":99,"keep":"unknown"}'
            : JSON.stringify(previous);
      const raw = JSON.stringify(record);
      x.values.set(key, raw);
      const b = x.create();
      await b.restore();
      expect(b.getSnapshot().blocked).toBe(true);
      expect(x.values.get(key)).toBe(raw);
      expect(x.send).not.toHaveBeenCalled();
    },
  );
  it("no acepta una pausa etiquetada como el formato previo", async () => {
    const x = setup(),
      a = await x.start("assigned");
    await a.pause();
    const record = JSON.parse(x.values.get(key)!);
    record.version = 1;
    const raw = JSON.stringify(record);
    x.values.set(key, raw);
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(true);
    expect(x.values.get(key)).toBe(raw);
  });
  it("reanudar un registro que nunca se pausó no cambia versión ni payload pendiente", async () => {
    const x = setup(),
      a = await x.start("assigned"),
      before = x.values.get(key);
    await a.resume();
    expect(x.values.get(key)).toBe(before);
    await a.finish(null, null, { localOnly: true });
    const frozen = x.values.get(key);
    await expect(a.pause()).rejects.toThrow();
    await expect(a.resume()).rejects.toThrow();
    expect(x.values.get(key)).toBe(frozen);
    const b = x.create();
    await b.restore();
    expect(x.values.get(key)).toBe(frozen);
    expect(b.getSnapshot().blocked).toBe(false);
  });
  it("ajustar y omitir descanso en pausa conserva reloj y series, incluso tras recuperar", async () => {
    const x = setup(),
      a = await x.start("assigned");
    await a.pause();
    const original = a.getSnapshot().active!;
    const endsAt = original.draft.rest!.endsAt;
    x.clock.now += 10000;
    await a.changeRest(15);
    expect(a.getSnapshot().active?.draft.rest?.endsAt).toBe(endsAt + 15000);
    expect(a.getSnapshot().active?.pause).toEqual(original.pause);
    expect(a.getSnapshot().active?.draft.exercises).toEqual(original.draft.exercises);
    await expect(a.changeRest(7)).rejects.toThrow();
    const b = x.create();
    await b.restore();
    await b.changeRest(null);
    expect(b.getSnapshot().active?.draft.rest).toBeNull();
    expect(b.getSnapshot().active?.pause).toEqual(original.pause);
    expect(b.getSnapshot().active?.draft.startedAt).toBe(original.draft.startedAt);
  });
});
