import { describe, expect, it, vi } from "vitest";
import { TrainingController } from "./training";
import {
  personalRoutineContext,
  freeRoutineContext,
  type NativeWorkoutPayload,
} from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import type { AtomicStorage } from "./atomic-contract";
import { NativeWorkoutQueue } from "./sync-queue";
import { handoffPending } from "./queue-transfer";
import { DEMO_ROUTINES } from "./demo";
const id = (n: number) => `af213000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
  const send = vi.fn(async (payload: NativeWorkoutPayload) => ({
    version: (payload.version === 2 ? 2 : 1) as 1 | 2,
    ok: true as const,
    status: "created" as const,
    workoutId: payload.id,
  }));
  const create = () =>
    new TrainingController(
      id(1),
      storage,
      send,
      () => new Date("2026-10-26T12:00:00Z"),
      () => id(n++),
    );
  return { data, storage, send, create };
}
describe("controlador personal conserva registro y cola", () => {
  it("libre inicia vacío, recupera y bloquea otro origen hasta descartar", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    await a.startPersonal(freeRoutineContext());
    expect(a.getSnapshot().active?.draft).toMatchObject({
      version: 3,
      programId: null,
      plannedSessionId: null,
      exercises: [],
    });
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(false);
    expect(b.getSnapshot().active?.draft.workoutId).toBe(a.getSnapshot().active?.draft.workoutId);
    await expect(b.start(DEMO_ROUTINES[0], "demo")).rejects.toThrow();
    await expect(b.finish(null, null)).rejects.toThrow("al menos una serie");
    await b.discard();
    await b.start(DEMO_ROUTINES[0], "demo");
    await expect(b.startPersonal(freeRoutineContext())).rejects.toThrow();
  });
  it("superserie personal recupera ronda y respuesta perdida conserva mismo cuerpo", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
    await a.complete(0, 0);
    expect(a.getSnapshot().active?.activeIndex).toBe(1);
    const b = x.create();
    await b.restore();
    await b.complete(1, 0);
    expect(b.getSnapshot().active?.draft.rest?.endsAt).toBe(Date.parse("2026-10-26T12:01:00Z"));
    await b.finish(7, "Controlado", { localOnly: true });
    const first = await b.pendingForQueue();
    expect(first?.payload).toMatchObject({
      version: 2,
      source: "personal",
      workout: { origin: { kind: "personal" } },
    });
    x.send.mockRejectedValueOnce(Error("respuesta perdida"));
    await expect(b.retry()).rejects.toThrow();
    const c = x.create();
    await c.restore();
    await c.retry();
    expect(x.send.mock.calls[1][0]).toEqual(x.send.mock.calls[0][0]);
    expect(c.getSnapshot().active).toBeNull();
  });
  it("cola conserva contrato personal y retiro del activo ocurre tras proteger el cierre", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
    await a.complete(0, 0);
    await a.finish(null, null, { localOnly: true });
    const q = new NativeWorkoutQueue(
      id(1),
      x.storage,
      (p) => {
        if (p.version === 3) throw Error("Este fixture anterior no envía documento3");
        return x.send(p);
      },
      () => new Date("2026-10-26T12:00:00Z"),
    );
    await q.restore();
    await handoffPending(a, q);
    expect(a.getSnapshot().active).toBeNull();
    expect(q.getSnapshot().entries[0].payload).toMatchObject({
      version: 2,
      source: "personal",
      workout: { origin: { kind: "personal" } },
    });
    await q.sync({ manual: true });
    expect(q.getSnapshot().entries[0].phase).toBe("confirmed");
    expect(x.send).toHaveBeenCalledOnce();
  });
  it.each(["title", "kind", "routineId", "revision"])(
    "conserva y bloquea un cierre cuya procedencia no corresponde al borrador: %s",
    async (field) => {
      const x = setup(),
        a = x.create();
      await a.restore();
      await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
      await a.complete(0, 0);
      await a.finish(null, null, { localOnly: true });
      const key = `is:native-training:v1:${id(1)}`,
        raw = JSON.parse(x.data.get(key)!);
      if (field === "title") raw.active.payload.workout.title = "Otro entrenamiento";
      if (field === "kind") raw.active.payload.workout.origin = { kind: "free" };
      if (field === "routineId") raw.active.payload.workout.origin.routineId = id(999);
      if (field === "revision") raw.active.payload.workout.origin.revision += 1;
      const altered = JSON.stringify(raw);
      x.data.set(key, altered);
      const b = x.create();
      await b.restore();
      expect(b.getSnapshot().blocked).toBe(true);
      expect(x.data.get(key)).toBe(altered);
      await expect(b.retry()).rejects.toThrow();
      expect(x.send).not.toHaveBeenCalled();
    },
  );
  it("agregado libre mantiene instantánea y filas alineadas aun si falla el almacenamiento", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    await a.startPersonal(freeRoutineContext());
    const entry = {
      id: id(800),
      name: "Press",
      muscleGroup: "Pecho" as const,
      equipment: "Barra",
      isBodyweight: false,
      progressionIncrementKg: 2.5,
    };
    await expect(a.appendFreeExercises(Array.from({ length: 16 }, () => entry))).rejects.toThrow(
      "15",
    );
    expect(a.getSnapshot().active?.draft.exercises).toHaveLength(0);
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.appendFreeExercises([entry, entry])).rejects.toThrow();
    const active = a.getSnapshot().active!;
    expect(active.draft.exercises).toHaveLength(2);
    expect(active.routine.exercises).toHaveLength(2);
    expect(new Set(active.draft.exercises.map((e) => e.sessionExerciseId)).size).toBe(2);
    await a.retryStorage();
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(false);
    expect(b.getSnapshot().active?.draft.exercises.map((e) => e.sessionExerciseId)).toEqual(
      active.draft.exercises.map((e) => e.sessionExerciseId),
    );
  });
  it("cuota conserva el inicio en memoria y no permite reemplazarlo", async () => {
    const x = setup(),
      a = x.create();
    await a.restore();
    vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
    await expect(a.startPersonal(freeRoutineContext())).rejects.toThrow();
    expect(a.getSnapshot().active?.draft).toMatchObject({ version: 3 });
    expect(a.getSnapshot().dirty).toBe(true);
    expect(x.send).not.toHaveBeenCalled();
    await a.retryStorage();
    expect(a.getSnapshot().dirty).toBe(false);
    await expect(a.startPersonal(freeRoutineContext())).rejects.toThrow();
  });
});
