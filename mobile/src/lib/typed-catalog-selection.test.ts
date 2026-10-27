import { expect, it, vi } from "vitest";
import { TrainingController, isTypedTraining } from "./training";
import { freeRoutineContext } from "./personal-training";
import { typedCatalogEntrySchema } from "../../../src/lib/mobile/typed-exercise-contracts";
import { trainingMetricCases } from "../../../src/test/fixtures/training-metrics";
import type { AtomicStorage } from "./atomic-contract";
import type { QueuedWorkoutPayload, QueuedSaveReply } from "./queued-recording";
import { TrainingChangeNeedsReview } from "./training-structure";
const id = (n: number) => `bd215000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  user = id(1),
  now = new Date("2026-10-27T12:00:00Z"),
  key = `is:native-training:v1:${user}`;
const entries = trainingMetricCases.map((m, i) =>
  typedCatalogEntrySchema.parse({
    id: id(100 + i),
    name: `Tipo ${i}`,
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: i === 0,
    progressionIncrementKg: 1,
    recordType: m.recordType,
  }),
);
function setup() {
  const data = new Map<string, string>();
  let n = 500;
  const store: AtomicStorage = {
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
      user,
      store,
      send,
      () => now,
      () => id(n++),
    );
  const start = async () => {
    const c = create();
    await c.restore();
    await c.startPersonal(freeRoutineContext());
    return c;
  };
  return { data, store, send, create, start };
}
it("lote con los ocho tipos y legado crea objetivos propios en una única propuesta recuperable", async () => {
  const x = setup(),
    c = await x.start(),
    before = x.data.get(key)!,
    old = c.getSnapshot().active!;
  await c.organizeCatalog({ kind: "add", entries });
  const a = c.getSnapshot().active!;
  if (!isTypedTraining(a)) throw Error("tipado");
  expect(a.draft.workoutId).toBe(old.draft.workoutId);
  expect(a.draft.startedAt).toBe(old.draft.startedAt);
  expect(a.draft.exercises.map((e) => e.prescribed.recordType)).toEqual(
    trainingMetricCases.map((m) => m.recordType),
  );
  for (const [i, m] of trainingMetricCases.entries()) {
    const p = a.draft.exercises[i].prescribed;
    expect(p.sets).toBe(3);
    expect(p.target).toEqual({
      repsMin: m.reps === null ? null : 8,
      repsMax: m.reps === null ? null : 12,
      targetWeightKg: null,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
    });
  }
  expect(JSON.parse(x.data.get(key)!)).toMatchObject({ version: 4, previousFormat: before });
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().blocked).toBe(false);
  expect(b.getSnapshot().active).toEqual(a);
});
it("seleccionar solo legado conserva formato anterior, sin convertir registro ni crear otro ID", async () => {
  const x = setup(),
    c = await x.start(),
    a = c.getSnapshot().active!;
  await c.organizeCatalog({ kind: "add", entries: [entries[0]] });
  expect(c.getSnapshot().active?.draft.version).toBe(3);
  expect(c.getSnapshot().active?.draft.workoutId).toBe(a.draft.workoutId);
  expect(JSON.parse(x.data.get(key)!).version).not.toBe(4);
});
it("cuota conserva el lote moderno en memoria y el archivo anterior; reintentar no agrega otra vez", async () => {
  const x = setup(),
    c = await x.start();
  await c.organizeCatalog({ kind: "add", entries: [entries[0]] });
  c.edit((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, weight: "30", reps: "8" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  const before = x.data.get(key)!,
    old = c.getSnapshot().active!;
  vi.mocked(x.store.compareAndSet).mockRejectedValueOnce(Error("quota"));
  await expect(c.organizeCatalog({ kind: "add", entries: entries.slice(5) })).rejects.toThrow();
  expect(x.data.get(key)).toBe(before);
  expect(c.getSnapshot().dirty).toBe(true);
  expect(c.getSnapshot().active?.draft.exercises[0].sets[0].done).toBe(true);
  const proposal = c.getSnapshot().active!;
  await c.retryStorage();
  expect(c.getSnapshot().active).toEqual(proposal);
  expect(proposal.draft.workoutId).toBe(old.draft.workoutId);
  expect(proposal.draft.exercises).toHaveLength(5);
  expect(x.send).not.toHaveBeenCalled();
});
it("otra ventana y metadata inválida no sobrescriben el archivo ni envían nada", async () => {
  const x = setup(),
    a = await x.start(),
    b = x.create();
  await b.restore();
  a.review("", "Otra ventana");
  await a.flush();
  const before = x.data.get(key)!;
  await expect(b.organizeCatalog({ kind: "add", entries: [entries[5]] })).rejects.toThrow(
    "otra ventana",
  );
  expect(x.data.get(key)).toBe(before);
  expect(x.send).not.toHaveBeenCalled();
  const c = x.create();
  await c.restore();
  await expect(
    c.organizeCatalog({
      kind: "add",
      entries: [{ ...entries[5], recordType: undefined } as unknown as (typeof entries)[number]],
    }),
  ).rejects.toThrow();
  expect(x.data.get(key)).toBe(before);
});
it("reemplazar por un tipo nuevo exige revisar las series y conserva la posición", async () => {
  const x = setup(),
    c = await x.start();
  await c.organizeCatalog({ kind: "add", entries: [entries[0]] });
  c.edit((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, weight: "30", reps: "8" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  const row = c.getSnapshot().active!.draft.exercises[0];
  let stamp = "";
  try {
    await c.organizeCatalog({ kind: "replace", id: row.sessionExerciseId, entry: entries[5] });
  } catch (e) {
    if (!(e instanceof TrainingChangeNeedsReview)) throw e;
    stamp = e.review.stamp;
  }
  expect(stamp).not.toBe("");
  await c.organizeCatalog({
    kind: "replace",
    id: row.sessionExerciseId,
    entry: entries[5],
    confirmedStamp: stamp,
  });
  const next = c.getSnapshot().active!.draft.exercises[0];
  expect(next.sessionExerciseId).toBe(row.sessionExerciseId);
  expect(next.prescribed).toMatchObject({
    recordType: "duration",
    target: { repsMin: null, repsMax: null },
  });
  expect(next.sets.every((s) => !s.done)).toBe(true);
});
