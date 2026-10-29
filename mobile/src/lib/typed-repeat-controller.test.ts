import { expect, it, vi } from "vitest";
import { typedResultFixture } from "../../../src/test/fixtures/typed-result";
import { prepareTypedWorkoutRepeat } from "../../../src/domain/typed-workout-repeat";
import { TrainingController } from "./training";
import type { AtomicStorage } from "./atomic-contract";
import type { QueuedSaveReply, QueuedWorkoutPayload } from "./queued-recording";
const id = (n: number) => `bf215000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  key = `is:native-training:v1:${id(1)}`;
async function setup() {
  const { result, catalog } = typedResultFixture(),
    prepared = prepareTypedWorkoutRepeat(result.workout, catalog.exercises);
  if (!prepared.ok) throw Error(prepared.message);
  const data = new Map<string, string>();
  let n = 100;
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
  const send = vi.fn(async (p: QueuedWorkoutPayload): Promise<QueuedSaveReply> => ({
    version: p.version === 3 ? 3 : p.version === 2 ? 2 : 1,
    ok: true,
    status: "created",
    workoutId: p.id,
  }));
  const create = () =>
    new TrainingController(
      id(1),
      storage,
      send,
      () => new Date("2026-10-27T15:00:00Z"),
      () => id(n++),
    );
  const c = create();
  await c.restore();
  return { c, create, storage, data, send, result, plan: prepared.plan };
}
it("confirmar repetición3 protege un activo4 recuperable y el cierre libre no arrastra notas ni esfuerzo", async () => {
  const x = await setup(),
    before = JSON.stringify(x.result);
  await x.c.startRepeated(x.plan);
  const a = x.c.getSnapshot().active!;
  expect(JSON.parse(x.data.get(key)!)).toMatchObject({ version: 4 });
  expect(a.draft.version).toBe(4);
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().active).toEqual(a);
  for (let i = 0; i < 9; i++) await b.complete(i, 0);
  await b.finish(null, null, { localOnly: true });
  const payload = b.getSnapshot().active?.payload;
  expect(payload).toMatchObject({ version: 3, source: "free" });
  if (!payload || payload.version !== 3) throw Error("Sin cierre3");
  expect(payload.workout.exerciseNotes.every((n) => n.note === null)).toBe(true);
  expect(payload.workout.sets.every((s) => s.effort === null)).toBe(true);
  expect(x.send).not.toHaveBeenCalled();
  expect(JSON.stringify(x.result)).toBe(before);
});
it("cuota conserva el mismo inicio en memoria y reintentar lo protege sin crear otra copia", async () => {
  const x = await setup();
  vi.mocked(x.storage.compareAndSet!).mockRejectedValueOnce(Error("quota"));
  await expect(x.c.startRepeated(x.plan)).rejects.toThrow();
  const proposal = x.c.getSnapshot().active!;
  expect(x.data.has(key)).toBe(false);
  expect(x.c.getSnapshot().dirty).toBe(true);
  await x.c.retryStorage();
  expect(x.c.getSnapshot().active).toEqual(proposal);
  expect(JSON.parse(x.data.get(key)!).active).toEqual(proposal);
  expect(x.send).not.toHaveBeenCalled();
});
it("doble confirmación inicia solo una copia y no reemplaza otro entrenamiento", async () => {
  const x = await setup();
  const results = await Promise.allSettled([x.c.startRepeated(x.plan), x.c.startRepeated(x.plan)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const before = x.data.get(key);
  await expect(x.c.startRepeated(x.plan)).rejects.toThrow("entrenamiento");
  expect(x.data.get(key)).toBe(before);
});
