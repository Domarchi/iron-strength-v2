import { queuedPayloadBody as nativeWorkoutBody } from "./queued-recording";
import { describe, expect, it, vi } from "vitest";
import { NativeWorkoutQueue, nativeSyncKey } from "./sync-queue";
import { MobileError } from "./client";
import { DEMO_ROUTINES } from "./demo";
import { TrainingController, type TrainingStorage, type SaveReply } from "./training";
import { updateSetField } from "../../../src/lib/workout/runner-state";
import type { NativeWorkoutPayload } from "./personal-training";
import type { WorkoutPayload } from "../../../src/lib/workout/runner-state";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  id = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
function payload(n = 1): WorkoutPayload {
  return {
    id: id(n),
    programId: user,
    programSessionId: user,
    sessionLabel: "A",
    startedAt: "2026-10-24T15:00:00Z",
    finishedAt: "2026-10-24T15:10:00Z",
    durationSeconds: 600,
    perceivedEffort: 7,
    note: "Nota privada",
    sets: [
      {
        exerciseId: user,
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 1,
        weightKg: 50,
        reps: 10,
        isWarmup: false,
      },
    ],
  };
}
function fixture() {
  const map = new Map<string, string>();
  const storage: TrainingStorage & {
    compareAndSet(key: string, before: string | null, next: string): Promise<void>;
  } = {
    get: vi.fn(async (key) => map.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      map.set(key, value);
    }),
    remove: vi.fn(async (key) => {
      map.delete(key);
    }),
    compareAndSet: vi.fn(async (key, before, next) => {
      if ((map.get(key) ?? null) !== before) throw Error("conflict");
      await storage.set(key, next);
    }),
  };
  const send = vi.fn(async (p: NativeWorkoutPayload): Promise<SaveReply> => ({
    version: (p.version === 2 ? 2 : 1) as 1 | 2,
    ok: true as const,
    status: "created" as const,
    workoutId: p.id,
  }));
  const create = (owner = user) =>
    new NativeWorkoutQueue(
      owner,
      storage,
      (p) => {
        if (p.version === 3) throw Error("Este fixture anterior no envía documento3");
        return send(p);
      },
      () => new Date("2026-10-24T16:00:00Z"),
    );
  return { map, storage, send, create };
}
describe("cola nativa, contrato y durabilidad", () => {
  it("una copia ya conocida se vuelve a comprobar antes de retirar su origen", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    const input = { userId: user, title: "Fuerza", payload: payload() };
    await q.enqueue(input);
    const otherWindow = x.create();
    await otherWindow.restore();
    await otherWindow.discard(id(1));
    await expect(q.enqueue(input)).rejects.toThrow();
    expect(q.getSnapshot().verified).toBe(false);
    expect(JSON.parse(x.map.get(nativeSyncKey(user))!).entries).toEqual([]);
  });
  it("dos cierres completos se recuperan en su cuenta sin tocar otras cuentas", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    for (const n of [1, 2])
      await q.enqueue({ userId: user, title: `Sesión ${n}`, payload: payload(n) });
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().entries.map((e) => e.payload)).toEqual([payload(1), payload(2)]);
    const b = x.create(other);
    await b.restore();
    expect(b.getSnapshot().entries).toEqual([]);
    await expect(
      b.enqueue({ userId: user, title: "Ajena", payload: payload(3) }),
    ).rejects.toThrow();
    expect(x.send).not.toHaveBeenCalled();
  });
  it("encolar el mismo intento es idempotente; contenido diferente queda retenido y no se reenvía automáticamente", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    const item = { userId: user, title: "Fuerza", payload: payload() };
    await q.enqueue(item);
    await q.enqueue(item);
    expect(q.getSnapshot().entries).toHaveLength(1);
    await expect(
      q.enqueue({ ...item, payload: { ...payload(), note: "Diferente" } }),
    ).rejects.toThrow();
    expect(q.getSnapshot().entries[0].payload).toEqual(payload());
    await q.sync();
    expect(x.send).not.toHaveBeenCalled();
  });
  it("formato futuro, identidad distinta o datos inválidos no se destruyen", async () => {
    for (const raw of [
      '{"version":99}',
      JSON.stringify({ version: 1, userId: other, entries: [] }),
      '{"version":1,"entries":[{}]}',
    ]) {
      const x = fixture();
      x.map.set(nativeSyncKey(user), raw);
      const q = x.create();
      await q.restore();
      expect(q.getSnapshot().blocked).toBe(true);
      await expect(
        q.enqueue({ userId: user, title: "Fuerza", payload: payload() }),
      ).rejects.toThrow();
      expect(x.map.get(nativeSyncKey(user))).toBe(raw);
    }
  });
  it("cuota llena no confirma ni envía; los bytes anteriores se conservan", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    const before = x.map.get(nativeSyncKey(user));
    vi.mocked(x.storage.set).mockRejectedValueOnce(Error("quota"));
    await expect(q.enqueue({ userId: user, title: "Otra", payload: payload(2) })).rejects.toThrow();
    expect(q.getSnapshot().verified).toBe(false);
    expect(x.map.get(nativeSyncKey(user))).toBe(before);
    expect(x.send).not.toHaveBeenCalled();
    await q.restore();
    expect(q.getSnapshot().entries).toHaveLength(1);
  });
  it("otra ventana no pierde entradas por una escritura con estado anterior", async () => {
    const x = fixture(),
      a = x.create(),
      b = x.create();
    await a.restore();
    await b.restore();
    await a.enqueue({ userId: user, title: "Primera", payload: payload() });
    await expect(
      b.enqueue({ userId: user, title: "Segunda", payload: payload(2) }),
    ).rejects.toThrow();
    await b.restore();
    await b.enqueue({ userId: user, title: "Segunda", payload: payload(2) });
    expect(b.getSnapshot().entries).toHaveLength(2);
  });
});
describe("sincronización y confirmación", () => {
  it("pasar a segundo plano termina la confirmación en vuelo pero no comienza el siguiente envío", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Primera", payload: payload() });
    await q.enqueue({ userId: user, title: "Segunda", payload: payload(2) });
    let active = true;
    x.send.mockImplementation(async (p) => {
      active = false;
      return { version: 1, ok: true, status: "created", workoutId: p.id };
    });
    await q.sync({ canContinue: () => active });
    expect(x.send).toHaveBeenCalledTimes(1);
    expect(q.getSnapshot().entries.map((e) => e.phase)).toEqual(["confirmed", "pending"]);
  });
  it("el límite conserva el cierre adicional y mantiene las últimas 20 confirmaciones aunque compartan fecha", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    for (let n = 1; n <= 50; n++)
      await q.enqueue({ userId: user, title: `Sesión ${n}`, payload: payload(n) });
    await expect(
      q.enqueue({ userId: user, title: "Adicional", payload: payload(51) }),
    ).rejects.toThrow("50");
    expect(q.getSnapshot().entries).toHaveLength(50);
    await q.sync();
    expect(q.getSnapshot().entries.map((e) => e.payload.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => id(i + 31)),
    );
  });
  it("respuesta incompatible y fallo al releer una confirmación conservan el payload", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    x.send.mockResolvedValueOnce({ version: 99 } as unknown as SaveReply);
    await q.sync();
    expect(q.getSnapshot().entries[0].error?.blocked).toBe(true);
    await q.sync();
    expect(x.send).toHaveBeenCalledTimes(1);
    x.send.mockImplementationOnce(async (p) => {
      vi.mocked(x.storage.get).mockRejectedValueOnce(Error("readback"));
      return { version: 1, ok: true, status: "duplicate", workoutId: p.id };
    });
    await expect(q.sync({ manual: true })).rejects.toThrow();
    expect(q.getSnapshot().verified).toBe(false);
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().entries[0].payload).toEqual(payload());
    expect(recovered.getSnapshot().entries[0].phase).toBe("confirmed");
  });
  it("respuesta perdida usa el mismo payload tras reiniciar y confirma una vez", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    x.send.mockRejectedValueOnce(new MobileError("network", "Sin red"));
    await q.sync();
    expect(q.getSnapshot().entries[0].phase).toBe("pending");
    const b = x.create();
    await b.restore();
    await b.sync();
    expect(x.send.mock.calls[0]).toEqual(x.send.mock.calls[1]);
    expect(b.getSnapshot().entries[0].phase).toBe("confirmed");
    await b.sync();
    expect(x.send).toHaveBeenCalledTimes(2);
  });
  it("una confirmación ajena no retira el registro; rechazo conocido detiene el bucle hasta reintento manual", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    x.send.mockResolvedValueOnce({ version: 1, ok: true, status: "created", workoutId: other });
    await q.sync();
    expect(q.getSnapshot().entries[0].phase).toBe("pending");
    x.send.mockRejectedValueOnce(
      new MobileError("forbidden", "El programa requiere revisión", 403),
    );
    await q.sync({ manual: true });
    await q.sync();
    expect(x.send).toHaveBeenCalledTimes(2);
    expect(q.getSnapshot().entries[0].error?.blocked).toBe(true);
    await q.sync({ manual: true });
    expect(q.getSnapshot().entries[0].phase).toBe("confirmed");
  });
  it("un solo envío por proceso y respuesta tardía al cambiar cuenta conserva el pendiente", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    let done!: (r: Awaited<ReturnType<typeof x.send>>) => void;
    x.send.mockImplementationOnce(
      () =>
        new Promise((r) => {
          done = r;
        }),
    );
    const a = q.sync(),
      b = q.sync();
    await vi.waitFor(() => expect(x.send).toHaveBeenCalledTimes(1));
    q.dispose();
    done({ version: 1, ok: true, status: "created", workoutId: id(1) });
    await Promise.allSettled([a, b]);
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().entries[0].phase).toBe("pending");
  });
  it("salir exige resolver pendientes y limpiar cuenta solo elimina su clave", async () => {
    const x = fixture(),
      q = x.create();
    await q.restore();
    x.map.set(nativeSyncKey(other), "otra cuenta");
    await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
    await expect(q.clearForLogout()).rejects.toThrow();
    await q.discard(id(1));
    await q.clearForLogout();
    expect(x.map.get(nativeSyncKey(other))).toBe("otra cuenta");
  });
});
it("la transferencia interrumpida conserva el origen hasta la confirmación de la copia y se consolida al recuperar", async () => {
  const { handoffPending } = await import("./queue-transfer");
  const x = fixture(),
    training = new TrainingController(
      user,
      x.storage,
      x.send,
      () => new Date("2026-10-24T15:00:00Z"),
      () => id(1),
    );
  await training.restore();
  await training.start(DEMO_ROUTINES[0], "real");
  training.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await training.complete(0, 0);
  await training.finish(null, null, { localOnly: true });
  const frozen = training.getSnapshot().active!.payload;
  const q = x.create();
  await q.restore();
  vi.spyOn(training, "releaseQueued").mockRejectedValueOnce(Error("interrupted"));
  await expect(handoffPending(training, q)).rejects.toThrow("interrupted");
  expect(training.getSnapshot().active?.payload).toEqual(frozen);
  expect(q.getSnapshot().entries[0].payload).toEqual(frozen);
  await handoffPending(training, q);
  expect(training.getSnapshot().active).toBeNull();
  expect(q.getSnapshot().entries).toHaveLength(1);
  expect(x.send).not.toHaveBeenCalled();
});
it("retirar el origen impide iniciar otra sesión hasta confirmar su escritura", async () => {
  const x = fixture(),
    training = new TrainingController(
      user,
      x.storage,
      x.send,
      () => new Date("2026-10-24T15:00:00Z"),
      () => id(1),
    );
  await training.restore();
  await training.start(DEMO_ROUTINES[0], "real");
  training.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await training.complete(0, 0);
  await training.finish(null, null, { localOnly: true });
  const p = training.getSnapshot().active!.payload!;
  const original = x.storage.compareAndSet;
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  x.storage.compareAndSet = vi.fn(async (key, before, next) => {
    if (key.startsWith("is:native-training:") && JSON.parse(next).active === null) await gate;
    await original(key, before, next);
  });
  const release = training.releaseQueued(p.id, p);
  await vi.waitFor(() => expect(training.getSnapshot().active).toBeNull());
  const attempted = training.start(DEMO_ROUTINES[1], "demo").then(
    () => true,
    () => false,
  );
  unlock();
  await release;
  expect(await attempted).toBe(false);
  expect(training.getSnapshot().active).toBeNull();
});
it("un cierre legado de borrador v1 sin payload migra a la cola antes de retirar su archivo", async () => {
  const { handoffPending } = await import("./queue-transfer");
  const x = fixture(),
    source = new TrainingController(
      user,
      x.storage,
      x.send,
      () => new Date("2026-10-24T15:00:00Z"),
      () => id(1),
    );
  await source.restore();
  await source.start(DEMO_ROUTINES[0], "real");
  source.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await source.complete(0, 0);
  await source.finish(8, "Nota antigua", { localOnly: true });
  const key = `is:native-training:v1:${user}`,
    old = JSON.parse(x.map.get(key)!);
  old.version = 1;
  delete old.previousFormat;
  old.active.draft.version = 1;
  for (const e of old.active.draft.exercises)
    for (const c of [e, ...(e.original ? [e.original] : []), ...(e.alternatives ?? [])])
      delete c.prescribed.series;
  delete old.active.payload;
  x.map.set(key, JSON.stringify(old));
  const recovered = new TrainingController(
    user,
    x.storage,
    x.send,
    () => new Date("2026-10-25T17:00:00Z"),
    () => id(2),
  );
  await recovered.restore();
  const q = x.create();
  await q.restore();
  await handoffPending(recovered, q);
  expect(recovered.getSnapshot().active).toBeNull();
  expect(q.getSnapshot().entries[0].payload).toMatchObject({
    id: id(1),
    note: "Nota antigua",
    perceivedEffort: 8,
    finishedAt: old.active.draft.finishedAt,
  });
  expect(nativeWorkoutBody(q.getSnapshot().entries[0].payload).sets[0]).toMatchObject({
    weightKg: 20,
    reps: 8,
  });
  expect(x.send).not.toHaveBeenCalled();
});
it("perder la relectura de la copia o cambiar de sesión no retira el cierre original", async () => {
  const { handoffPending } = await import("./queue-transfer");
  const x = fixture(),
    source = new TrainingController(
      user,
      x.storage,
      x.send,
      () => new Date("2026-10-24T15:00:00Z"),
      () => id(1),
    );
  await source.restore();
  await source.start(DEMO_ROUTINES[0], "real");
  source.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await source.complete(0, 0);
  await source.finish(null, null, { localOnly: true });
  const q = x.create();
  await q.restore();
  const get = x.storage.get;
  x.storage.get = vi.fn(async (key) => {
    if (key === nativeSyncKey(user)) throw Error("readback");
    return get(key);
  });
  await expect(handoffPending(source, q)).rejects.toThrow();
  expect(source.getSnapshot().active?.draft.workoutId).toBe(id(1));
  x.storage.get = get;
  await q.restore();
  const enqueue = q.enqueue.bind(q);
  vi.spyOn(q, "enqueue").mockImplementation(async (input) => {
    const item = await enqueue(input);
    q.dispose();
    return item;
  });
  await expect(handoffPending(source, q)).rejects.toThrow("cuenta cambió");
  expect(source.getSnapshot().active?.draft.workoutId).toBe(id(1));
  const fresh = x.create();
  await fresh.restore();
  await handoffPending(source, fresh);
  expect(source.getSnapshot().active).toBeNull();
  expect(fresh.getSnapshot().entries).toHaveLength(1);
});
it("reiniciar el efecto con la misma instancia recupera la cola sin usar una respuesta de su ciclo anterior", async () => {
  const x = fixture(),
    q = x.create();
  await q.restore();
  await q.enqueue({ userId: user, title: "Fuerza", payload: payload() });
  let done!: (r: SaveReply) => void;
  x.send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const old = q.sync();
  await vi.waitFor(() => expect(x.send).toHaveBeenCalledTimes(1));
  q.dispose();
  await q.restore();
  expect(q.getSnapshot().busy).toBe(false);
  done({ version: 1, ok: true, status: "created", workoutId: id(1) });
  await old;
  expect(q.getSnapshot().entries[0].phase).toBe("pending");
  await q.sync();
  expect(q.getSnapshot().entries[0].phase).toBe("confirmed");
});
