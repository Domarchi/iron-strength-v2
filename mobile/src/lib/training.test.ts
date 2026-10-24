import { describe, expect, it, vi } from "vitest";
import { DEMO_ROUTINES } from "./demo";
import { TrainingController, type TrainingStorage } from "./training";
import { updateSetField } from "../../../src/lib/workout/runner-state";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const map = new Map<string, string>();
  const store: TrainingStorage = {
    get: vi.fn(async (key) => map.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      map.set(key, value);
    }),
    remove: vi.fn(async (key) => {
      map.delete(key);
    }),
  };
  const save = vi.fn(async () => ({
    version: 1 as const,
    ok: true as const,
    status: "created" as const,
    workoutId: user,
  }));
  const create = (id = user) =>
    new TrainingController(
      id,
      store,
      save,
      () => new Date("2026-10-24T15:00:00Z"),
      () => user,
    );
  return { map, store, save, create };
}
describe("registro nativo, persistencia y separación de la demo", () => {
  it("recupera la instantánea, serie, ejercicio activo y descanso en su cuenta", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "demo");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.flush();
    await a.complete(0, 0);
    await a.focus(1);
    await a.flush();
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.draft.exercises[0].sets[0].done).toBe(true);
    expect(b.getSnapshot().active?.activeIndex).toBe(1);
    expect(b.getSnapshot().active?.draft.rest?.endsAt).toBeGreaterThan(0);
    const c = x.create(other);
    await c.restore();
    expect(c.getSnapshot().active).toBeNull();
  });
  it("terminar una demo conserva un resultado local y nunca invoca guardado remoto", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "demo");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.complete(0, 0);
    await a.finish(7, "Prueba");
    expect(x.save).not.toHaveBeenCalled();
    expect(a.getSnapshot().active).toBeNull();
    expect(a.getSnapshot().demos[0].payload.note).toBe("Prueba");
    expect(a.getSnapshot().demos[0].payload.sets).toHaveLength(1);
  });
  it("un envío con respuesta perdida reintenta exactamente el mismo contenido e ID", async () => {
    const x = fixture(),
      a = x.create();
    x.save.mockRejectedValueOnce(Error("Respuesta perdida"));
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.complete(0, 0);
    await expect(a.finish(null, "Una nota")).rejects.toThrow();
    const pending = a.getSnapshot().active;
    expect(pending?.draft.status).toBe("pending_save");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "99"));
    expect(a.getSnapshot().active).toEqual(pending);
    const b = x.create();
    await b.restore();
    await b.retry();
    expect(x.save).toHaveBeenCalledTimes(2);
    expect(x.save.mock.calls[0]).toEqual(x.save.mock.calls[1]);
    expect(b.getSnapshot().active).toBeNull();
  });
  it("almacenamiento lleno conserva el registro en memoria y bloquea envío y nuevo inicio", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    vi.mocked(x.store.set).mockRejectedValue(Error("quota"));
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await expect(a.flush()).rejects.toThrow();
    expect(a.getSnapshot().active?.draft.exercises[0].sets[0].weight).toBe("20");
    expect(a.getSnapshot().error).toBeTruthy();
    await expect(a.start(DEMO_ROUTINES[1], "demo")).rejects.toThrow();
    expect(x.save).not.toHaveBeenCalled();
  });
  it("un formato desconocido se conserva y no permite empezar a ciegas", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "demo");
    const key = [...x.map.keys()][0];
    x.map.set(key, JSON.stringify({ version: 99, private: "preserve" }));
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().error).toBeTruthy();
    await expect(b.start(DEMO_ROUTINES[0], "demo")).rejects.toThrow();
    expect(x.map.get(key)).toContain("preserve");
  });
  it("otra instancia no puede sobrescribir silenciosamente el borrador existente", async () => {
    const x = fixture(),
      a = x.create(),
      b = x.create();
    await a.restore();
    await b.restore();
    await a.start(DEMO_ROUTINES[0], "demo");
    await expect(b.start(DEMO_ROUTINES[1], "demo")).rejects.toThrow();
    const c = x.create();
    await c.restore();
    expect(c.getSnapshot().active?.routine.session.label).toBe("A");
  });
  it("una respuesta tardía después de disponer el controlador conserva el pendiente", async () => {
    const x = fixture(),
      a = x.create();
    let resolve!: (v: Awaited<ReturnType<typeof x.save>>) => void;
    x.save.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.complete(0, 0);
    const finishing = a.finish(null, null);
    await vi.waitFor(() => expect(x.save).toHaveBeenCalled());
    a.dispose();
    resolve({ version: 1, ok: true, status: "created", workoutId: user });
    await finishing;
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.draft.status).toBe("pending_save");
  });
});
it("esfuerzo y nota del cierre se recuperan antes de terminar", async () => {
  const x = fixture(),
    a = x.create();
  await a.restore();
  await a.start(DEMO_ROUTINES[0], "demo");
  a.review("8", "Mantener esta nota");
  await a.flush();
  const b = x.create();
  await b.restore();
  expect(b.getSnapshot().active?.review).toEqual({ effort: "8", note: "Mantener esta nota" });
});
it("recupera el inicio tras un fallo transitorio de lectura sin registro previo", async () => {
  const x = fixture(),
    a = x.create();
  vi.mocked(x.store.get).mockRejectedValueOnce(Error("Temporal"));
  await a.restore();
  expect(a.getSnapshot().blocked).toBe(true);
  await a.restore();
  expect(a.getSnapshot()).toMatchObject({ ready: true, blocked: false, error: null, active: null });
  await expect(a.start(DEMO_ROUTINES[0], "demo")).resolves.toBeUndefined();
});
it("al avanzar entre integrantes de una superserie corta el descanso anterior", async () => {
  const x = fixture(),
    a = x.create();
  await a.restore();
  await a.start(DEMO_ROUTINES[1], "demo");
  a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await a.complete(0, 0);
  expect(a.getSnapshot().active?.draft.rest).not.toBeNull();
  await a.focus(2);
  a.edit((d) => updateSetField(d, 2, 0, "weight", "10"));
  await a.complete(2, 0);
  expect(a.getSnapshot().active?.activeIndex).toBe(3);
  expect(a.getSnapshot().active?.draft.rest).toBeNull();
});
