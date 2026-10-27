import { legacySender } from "../test/fixtures/legacy-sender";
import { describe, it, expect, vi } from "vitest";
import { TrainingController, type SaveReply } from "./training";
import type { NativeWorkoutPayload } from "./personal-training";
import type { AtomicStorage } from "./atomic-contract";
import { prepareWorkoutRepeat } from "../../../src/domain/workout-repeat";
import { repeatWorkoutFixture } from "../../../src/test/fixtures/repeat-workout";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = `is:native-training:v1:${id(9000)}`;
function setup() {
  const { workout, catalog } = repeatWorkoutFixture(),
    prepared = prepareWorkoutRepeat(workout, catalog);
  if (!prepared.ok) throw Error("fixture");
  const data = new Map<string, string>();
  let n = 5000;
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
  const uuid = vi.fn(() => id(n++)),
    clock = new Date("2026-10-27T14:00:00Z");
  const create = () =>
    new TrainingController(id(9000), storage, legacySender(send), () => clock, uuid);
  return { workout, catalog, plan: prepared.plan, data, storage, send, uuid, clock, create };
}
describe("confirmar una repetición sin modificar el resultado original", () => {
  it("la preparación no inicia reloj ni escribe; confirmar protege contexto y valores nuevos", async () => {
    const x = setup(),
      c = x.create();
    await c.restore();
    expect(x.data.size).toBe(0);
    expect(x.uuid).not.toHaveBeenCalled();
    await c.startRepeated(x.plan);
    const a = c.getSnapshot().active!;
    expect(a.draft.workoutId).not.toBe(x.workout.id);
    expect(a.draft.startedAt).toBe(x.clock.toISOString());
    expect(a.draft.exercises[0].sets).toMatchObject([{ weight: "30", reps: "8", done: false }]);
    expect(a.activeIndex).toBe(0);
    expect(JSON.parse(x.data.get(key)!).active.draft).toEqual(a.draft);
    expect(x.send).not.toHaveBeenCalled();
  });
  it("recupera la copia y terminarla no completa el programa original ni copia su valoración", async () => {
    const x = setup(),
      before = structuredClone(x.workout),
      c = x.create();
    await c.restore();
    await c.startRepeated(x.plan);
    const a = c.getSnapshot().active!,
      recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().active).toEqual(a);
    await recovered.complete(0, 0);
    await recovered.finish(null, null, { localOnly: true });
    const payload = recovered.getSnapshot().active!.payload!;
    expect(payload).toMatchObject({
      version: 2,
      source: "free",
      workout: {
        origin: { kind: "free" },
        perceivedEffort: null,
        note: null,
      },
    });
    if (payload.version !== 2) throw Error("Debía ser un cierre nuevo");
    expect(payload.workout).not.toHaveProperty("programId");
    expect(payload.id).not.toBe(x.workout.id);
    expect(x.workout).toEqual(before);
    expect(x.send).not.toHaveBeenCalled();
  });
  it("un registro en curso y dos confirmaciones simultáneas no se sobrescriben", async () => {
    const x = setup(),
      c = x.create();
    await c.restore();
    const outcomes = await Promise.allSettled([c.startRepeated(x.plan), c.startRepeated(x.plan)]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const original = x.data.get(key);
    await expect(c.startRepeated(x.plan)).rejects.toThrow("entrenamiento");
    expect(x.data.get(key)).toBe(original);
  });
  it("cuota conserva el mismo inicio en memoria; reintento no genera otra identidad", async () => {
    const x = setup(),
      c = x.create();
    await c.restore();
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(c.startRepeated(x.plan)).rejects.toThrow();
    const a = c.getSnapshot().active!;
    expect(c.getSnapshot().dirty).toBe(true);
    expect(x.data.get(key)).toBeUndefined();
    const calls = x.uuid.mock.calls.length;
    await c.retryStorage();
    const recovered = x.create();
    await recovered.restore();
    expect(recovered.getSnapshot().active?.draft.workoutId).toBe(a.draft.workoutId);
    expect(x.uuid).toHaveBeenCalledTimes(calls);
  });
  it("un formato desconocido se conserva y no permite iniciar encima", async () => {
    const x = setup(),
      raw = JSON.stringify({ version: 88, userId: id(9000), active: { private: "future" } });
    x.data.set(key, raw);
    const c = x.create();
    await c.restore();
    await expect(c.startRepeated(x.plan)).rejects.toThrow();
    expect(x.data.get(key)).toBe(raw);
    expect(x.uuid).not.toHaveBeenCalled();
  });
});
