import { expect, it, vi } from "vitest";
import { TrainingController } from "./training";
import { typedContextSchema } from "./typed-training";
import { NativeWorkoutQueue } from "./sync-queue";
import { handoffPending } from "./queue-transfer";
import type { QueuedWorkoutPayload, QueuedSaveReply } from "./queued-recording";
import type { AtomicStorage } from "./atomic-contract";
import { personalRoutineContext } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
const id = (n: number) => `bc215000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-27T12:00:00Z"),
  key = `is:native-training:v1:${id(1)}`;
function context() {
  return typedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: "Tiempo",
    sessionLabel: "Libre",
    exercises: [
      {
        sessionExerciseId: id(8),
        exerciseId: id(9),
        name: "Plancha",
        isBodyweight: true,
        prescribed: {
          recordType: "duration",
          sets: 2,
          target: {
            repsMin: null,
            repsMax: null,
            targetWeightKg: null,
            targetDurationSeconds: 30,
            targetDistanceMeters: null,
          },
          series: null,
        },
        lastMetrics: null,
        note: "Indicación",
        restSeconds: 45,
        supersetId: null,
        supersetRestSeconds: null,
        alternatives: [],
      },
    ],
  });
}
function setup() {
  const data = new Map<string, string>();
  let n = 100,
    clock = now;
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
      () => clock,
      () => id(n++),
    );
  const start = async () => {
    const c = create();
    await c.restore();
    await c.startTyped(context());
    return c;
  };
  return {
    data,
    storage,
    send,
    create,
    start,
    tick: (ms: number) => {
      clock = new Date(now.getTime() + ms);
    },
  };
}
it("inicia contexto3 en sobre4 y recupera texto, esfuerzo, nota propia, foco y descanso sin reescribir", async () => {
  const x = setup(),
    c = await x.start();
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      athleteNote: "Mi nota",
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30", effort: "8,5" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  await c.pause();
  const before = x.data.get(key)!;
  expect(JSON.parse(before)).toMatchObject({
    version: 4,
    active: { routine: { version: 3 }, draft: { version: 4 } },
  });
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().blocked).toBe(false);
  expect(x.data.get(key)).toBe(before);
  expect(b.getSnapshot().active).toEqual(c.getSnapshot().active);
});
it("conversión explícita conserva tipo legado, marcas, pausa, cronómetro y formato anterior exacto", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
  await c.complete(0, 0);
  await c.pause();
  const previous = c.getSnapshot().active!,
    before = x.data.get(key)!;
  await c.upgradeRecording();
  const a = c.getSnapshot().active!;
  expect(a.draft.workoutId).toBe(previous.draft.workoutId);
  expect(a.draft.startedAt).toBe(previous.draft.startedAt);
  expect(a.draft.rest).toEqual(previous.draft.rest);
  expect(a.pause).toEqual(previous.pause);
  expect(JSON.parse(x.data.get(key)!)).toMatchObject({ version: 4, previousFormat: before });
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().blocked).toBe(false);
});
it("cierre3 se congela con pausa neta, nota y esfuerzo; respuesta perdida reenvía el mismo documento", async () => {
  const x = setup(),
    c = await x.start();
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30", effort: "9" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  x.tick(30000);
  await c.pause();
  x.tick(60000);
  x.send.mockRejectedValueOnce(Error("lost"));
  await expect(c.finish(8, "Global")).rejects.toThrow("lost");
  const frozen = c.getSnapshot().active!.payload;
  expect(frozen).toMatchObject({
    version: 3,
    workout: { durationSeconds: 30, note: "Global", perceivedEffort: 8 },
  });
  const b = x.create();
  await b.restore();
  await b.retry();
  expect(x.send.mock.calls.map((v) => v[0])).toEqual([frozen, frozen]);
  expect(b.getSnapshot().active).toBeNull();
});
it("cuota y conflicto impiden enviar; reintento local conserva el ID y formato anterior", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
  const before = x.data.get(key)!;
  vi.mocked(x.storage.compareAndSet).mockRejectedValueOnce(Error("quota"));
  await expect(c.upgradeRecording()).rejects.toThrow();
  expect(x.data.get(key)).toBe(before);
  expect(c.getSnapshot().dirty).toBe(true);
  expect(x.send).not.toHaveBeenCalled();
  await c.retryStorage();
  const a = c.getSnapshot().active!;
  expect(JSON.parse(x.data.get(key)!).previousFormat).toBe(before);
  expect(a.draft.workoutId).toBe(JSON.parse(before).active.draft.workoutId);
});
it("un documento nuevo bajo sobre anterior, contenido alterado o copia previa ajena se conserva bloqueado", async () => {
  const x = setup(),
    c = await x.start();
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  await c.finish(null, null, { localOnly: true });
  const raw = JSON.parse(x.data.get(key)!);
  for (const next of [
    { ...raw, version: 3 },
    {
      ...raw,
      active: {
        ...raw.active,
        payload: {
          ...raw.active.payload,
          workout: { ...raw.active.payload.workout, note: "alterado" },
        },
      },
    },
    {
      ...raw,
      previousFormat: JSON.stringify({ version: 1, userId: id(99), active: null, demos: [] }),
    },
  ]) {
    const text = JSON.stringify(next);
    x.data.set(key, text);
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().blocked).toBe(true);
    expect(x.data.get(key)).toBe(text);
  }
});
it("cola3 protege el cierre antes de retirar sobre4 y confirma solo respuesta3 del mismo ID", async () => {
  const x = setup(),
    c = await x.start();
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  await c.finish(null, null, { localOnly: true });
  const frozen = c.getSnapshot().active!.payload;
  const q = new NativeWorkoutQueue(id(1), x.storage, x.send, () => now);
  await q.restore();
  await handoffPending(c, q);
  expect(c.getSnapshot().active).toBeNull();
  expect(q.getSnapshot().entries[0].payload).toEqual(frozen);
  x.send.mockResolvedValueOnce({ version: 2, ok: true, status: "created", workoutId: frozen!.id });
  await q.sync({ manual: true });
  expect(q.getSnapshot().entries[0].phase).toBe("pending");
  await q.sync({ manual: true });
  expect(q.getSnapshot().entries[0].phase).toBe("confirmed");
});
it("cierre anterior pendiente no se migra y mantiene ruta y cuerpo al recuperar", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
  await c.complete(0, 0);
  await c.finish(null, null, { localOnly: true });
  const before = x.data.get(key)!,
    old = c.getSnapshot().active!.payload;
  await expect(c.upgradeRecording()).rejects.toThrow();
  expect(x.data.get(key)).toBe(before);
  const b = x.create();
  await b.restore();
  await b.retry();
  expect(x.send).toHaveBeenCalledWith(old);
});
it("organizar conserva métricas/notas y exige revisión antes de quitar series hechas", async () => {
  const x = setup(),
    c = await x.start();
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      athleteNote: "Propia",
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  await c.organize({
    kind: "add",
    entries: [
      {
        id: id(30),
        name: "Curl",
        muscleGroup: "Brazos",
        equipment: null,
        isBodyweight: false,
        progressionIncrementKg: 1,
      },
    ],
  });
  const before = c.getSnapshot().active!,
    first = before.draft.exercises[0];
  await c.organize({
    kind: "reorder",
    fromId: first.sessionExerciseId,
    toId: before.draft.exercises[1].sessionExerciseId,
  });
  expect(c.getSnapshot().active!.draft.exercises[1]).toEqual(first);
  await expect(c.organize({ kind: "remove", id: first.sessionExerciseId })).rejects.toThrow();
  const a = c.getSnapshot().active!,
    row = a.draft.exercises[1],
    source = a.routine.exercises[1];
  await c.organize({
    kind: "remove",
    id: first.sessionExerciseId,
    confirmedStamp: JSON.stringify({ exercise: row, context: source }),
  });
  expect(c.getSnapshot().active!.draft.exercises).toHaveLength(1);
});
it("nota global Unicode se recupera sin cortar caracteres y cierra con el mismo texto", async () => {
  const x = setup(),
    c = await x.start(),
    note = "💪".repeat(500);
  c.review("8", note);
  c.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "30" })),
    })),
  }));
  await c.flush();
  await c.complete(0, 0);
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().blocked).toBe(false);
  expect(b.getSnapshot().active?.review?.note).toBe(note);
  await b.finish(8, note, { localOnly: true });
  expect(b.getSnapshot().active?.payload).toMatchObject({ version: 3, workout: { note } });
});
it("otra ventana impide convertir el activo sin sobrescribir su copia protegida", async () => {
  const x = setup(),
    a = x.create();
  await a.restore();
  await a.startPersonal(personalRoutineContext(personalRoutineFixture()));
  const b = x.create();
  await b.restore();
  await a.focus(1);
  const before = x.data.get(key)!;
  await expect(b.upgradeRecording()).rejects.toThrow("otra ventana");
  expect(x.data.get(key)).toBe(before);
  expect(b.getSnapshot().dirty).toBe(true);
  expect(x.send).not.toHaveBeenCalled();
});
