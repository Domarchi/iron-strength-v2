import { describe, expect, it, vi } from "vitest";
import { TrainingController } from "./training";
import { TrainingChangeNeedsReview, reviewTrainingExercise } from "./training-structure";
import { personalRoutineContext, type NativeWorkoutPayload } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import { DEMO_ROUTINES } from "./demo";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = `is:native-training:v1:${id(1)}`;
const entry = {
  id: id(600),
  name: "Sentadilla",
  muscleGroup: "Piernas" as const,
  equipment: "Barra",
  isBodyweight: false,
  progressionIncrementKg: 2.5,
};
function setup() {
  const data = new Map<string, string>();
  let n = 900;
  const storage = {
    get: async (k: string) => data.get(k) ?? null,
    set: async (k: string, v: string) => {
      data.set(k, v);
    },
    remove: async (k: string) => {
      data.delete(k);
    },
    compareAndSet: vi.fn(async (k: string, b: string | null, v: string) => {
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
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
      id(1),
      storage,
      send,
      () => new Date("2026-10-26T12:00:00Z"),
      () => id(n++),
    );
  const start = async () => {
    const c = create();
    await c.restore();
    await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
    return c;
  };
  return { data, storage, send, create, start };
}
describe("organización protegida del entrenamiento", () => {
  it("revisar no escribe y confirmar guarda contexto/registro completos con copia del formato previo", async () => {
    const x = setup(),
      a = await x.start();
    await a.complete(0, 0);
    const active = a.getSnapshot().active!,
      target = active.draft.exercises[0].sessionExerciseId;
    const before = x.data.get(key)!;
    await expect(a.organize({ kind: "remove", id: target })).rejects.toThrow(
      TrainingChangeNeedsReview,
    );
    expect(x.data.get(key)).toBe(before);
    const review = reviewTrainingExercise(a.getSnapshot().active!, target);
    await a.organize({ kind: "remove", id: target, confirmedStamp: review.stamp });
    const raw = JSON.parse(x.data.get(key)!);
    expect(raw).toMatchObject({ version: 2, previousFormat: before });
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(false);
    expect(b.getSnapshot().active?.draft.exercises).toHaveLength(1);
    expect(b.getSnapshot().active?.routine.exercises).toHaveLength(1);
    expect(b.getSnapshot().active?.draft.workoutId).toBe(active.draft.workoutId);
  });
  it("cuota conserva agregado en memoria y reintento protege la misma propuesta sin volver a agregar", async () => {
    const x = setup(),
      a = await x.start(),
      before = x.data.get(key)!;
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.organize({ kind: "add", entries: [entry] })).rejects.toThrow();
    expect(a.getSnapshot().active?.draft.exercises).toHaveLength(3);
    expect(a.getSnapshot().dirty).toBe(true);
    expect(x.data.get(key)).toBe(before);
    await expect(a.organize({ kind: "add", entries: [entry] })).rejects.toThrow();
    await a.retryStorage();
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.draft.exercises).toHaveLength(3);
    expect(JSON.parse(x.data.get(key)!).previousFormat).toBe(before);
    expect(x.send).not.toHaveBeenCalled();
  });
  it("conflicto entre ventanas conserva el cambio de ambas sin sobrescribir el confirmado", async () => {
    const x = setup(),
      a = await x.start(),
      b = x.create();
    await b.restore();
    const group = a.getSnapshot().active!.draft.exercises[0].supersetId!;
    await a.organize({ kind: "groupRest", groupId: group, seconds: 45 });
    const saved = x.data.get(key);
    await expect(b.organize({ kind: "groupRest", groupId: group, seconds: 0 })).rejects.toThrow(
      "otra ventana",
    );
    expect(x.data.get(key)).toBe(saved);
    expect(b.getSnapshot().dirty).toBe(true);
    expect(b.getSnapshot().active?.draft.exercises[0].supersetRestSeconds).toBe(0);
  });
  it("cancelar un destino no migra ni escribe el sobre", async () => {
    const x = setup(),
      a = await x.start(),
      before = x.data.get(key),
      calls = x.storage.compareAndSet.mock.calls.length;
    await a.organize({
      kind: "reorder",
      fromId: a.getSnapshot().active!.draft.exercises[0].sessionExerciseId,
      toId: null,
    });
    expect(x.data.get(key)).toBe(before);
    expect(x.storage.compareAndSet).toHaveBeenCalledTimes(calls);
  });
  it("asignada, pausa y cierre pendiente rechazan organización sin escribir ni enviar", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    const assigned = x.data.get(key);
    await expect(a.organize({ kind: "add", entries: [entry] })).rejects.toThrow("personal");
    expect(x.data.get(key)).toBe(assigned);
    await a.discard();
    await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
    await a.complete(0, 0);
    await a.pause();
    const paused = x.data.get(key);
    await expect(a.organize({ kind: "add", entries: [entry] })).rejects.toThrow("pausa");
    expect(x.data.get(key)).toBe(paused);
    await a.finish(null, null, { localOnly: true });
    const pending = x.data.get(key);
    await expect(a.organize({ kind: "add", entries: [entry] })).rejects.toThrow("curso");
    expect(x.data.get(key)).toBe(pending);
    expect(x.send).not.toHaveBeenCalled();
  });
});
