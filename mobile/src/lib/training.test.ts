import { legacySender, legacyActive } from "../test/fixtures/legacy-sender";
import type { NativeWorkoutPayload } from "./personal-training";
import { describe, expect, it, vi } from "vitest";
import { DEMO_ROUTINES } from "./demo";
import { TrainingController, type TrainingStorage } from "./training";
import { toggleWarmup, updateSetField } from "../../../src/lib/workout/runner-state";
import { remainingSeconds } from "../../../src/domain/rest-timer";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const map = new Map<string, string>();
  const store: TrainingStorage & {
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
      if ((map.get(key) ?? null) !== before) throw Error("El registro cambió en otra ventana.");
      await store.set(key, next);
    }),
  };
  const save = vi.fn(async (payload: NativeWorkoutPayload) => ({
    version: (payload.version === 2 ? 2 : 1) as 1 | 2,
    ok: true as const,
    status: "created" as const,
    workoutId: user,
  }));
  const create = (id = user) =>
    new TrainingController(
      id,
      store,
      legacySender(save),
      () => new Date("2026-10-24T15:00:00Z"),
      () => user,
    );
  return { map, store, save, create };
}
describe("registro nativo, persistencia y separación de la demo", () => {
  it("dos inicios simultáneos solo escriben una instantánea completa", async () => {
    const x = fixture(),
      a = x.create(),
      b = x.create();
    await a.restore();
    await b.restore();
    const results = await Promise.allSettled([
      a.start(DEMO_ROUTINES[0], "demo"),
      b.start(DEMO_ROUTINES[1], "demo"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(x.store.set).toHaveBeenCalledTimes(1);
  });
  it("un pendiente antiguo congela su payload antes del primer intento perdido", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.flush();
    await a.complete(0, 0);
    await a.finish(null, null, { localOnly: true });
    const key = `is:native-training:v1:${user}`,
      raw = JSON.parse(x.map.get(key)!);
    raw.version = 1;
    delete raw.previousFormat;
    delete raw.active.payload;
    x.map.set(key, JSON.stringify(raw));
    const b = x.create();
    await b.restore();
    x.save.mockRejectedValueOnce(Error("network"));
    await expect(b.retry()).rejects.toThrow("network");
    const frozen = JSON.parse(x.map.get(key)!).active.payload;
    expect(frozen.id).toBe(user);
    await b.retry();
    expect(x.save.mock.calls[0]).toEqual(x.save.mock.calls[1]);
  });
  it("cerrar sin red congela y confirma el registro local antes de enviarlo al reconectar", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.flush();
    await a.complete(0, 0);
    expect(await a.finish(7, "Sin conexión", { localOnly: true })).toEqual({
      mode: "pending",
      id: user,
    });
    expect(x.save).not.toHaveBeenCalled();
    const payload = legacyActive(a.getSnapshot().active).payload;
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.payload).toEqual(payload);
    expect(await b.retry()).toEqual({ mode: "real", id: user });
    expect(x.save).toHaveBeenCalledExactlyOnceWith(payload);
  });
  it("desmontar por cambio de sesión conserva escrituras personales ya encoladas en su cuenta", async () => {
    const x = fixture(),
      a = x.create();
    x.map.set(`is:native-training:v1:${other}`, "otra cuenta");
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.review("7", "Última nota");
    a.dispose();
    await expect(a.flush()).resolves.toBeUndefined();
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.review).toEqual({ effort: "7", note: "Última nota" });
    expect(x.map.get(`is:native-training:v1:${other}`)).toBe("otra cuenta");
  });
  it("caducar la sesión durante el cierre termina la nota encolada sin iniciar un envío posterior", async () => {
    const x = fixture(),
      a = x.create();
    await a.restore();
    await a.start(DEMO_ROUTINES[0], "real");
    a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
    await a.complete(0, 0);
    a.review("7", "Nota antes de caducar");
    const closing = a.finish(7, "Nota antes de caducar");
    a.dispose();
    await expect(closing).rejects.toThrow("Recupera primero");
    const b = x.create();
    await b.restore();
    expect(b.getSnapshot().active?.review?.note).toBe("Nota antes de caducar");
    expect(b.getSnapshot().active?.draft.status).toBe("in_progress");
    expect(x.save).not.toHaveBeenCalled();
  });
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
    await expect(b.clearForLogout()).rejects.toThrow();
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
    expect(legacyActive(c.getSnapshot().active).routine.session.label).toBe("A");
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
    resolve({ version: 2, ok: true, status: "created", workoutId: user });
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

it("un calentamiento respeta el descanso desactivado del grupo y no avanza la ronda", async () => {
  const x = fixture(),
    a = x.create();
  const routine = structuredClone(DEMO_ROUTINES[1]);
  routine.exercises.forEach((e) => {
    if (e.supersetId) e.supersetRestSeconds = 0;
  });
  await a.restore();
  await a.start(routine, "demo");
  await a.focus(2);
  a.edit((d) => updateSetField(toggleWarmup(d, 2, 0), 2, 0, "weight", "10"));
  await a.complete(2, 0);
  expect(a.getSnapshot().active?.activeIndex).toBe(2);
  expect(a.getSnapshot().active?.draft.rest).toBeNull();
});

it("una entrada inválida conserva series y descanso; recuperar no reinicia el término", async () => {
  const x = fixture(),
    a = x.create();
  await a.restore();
  await a.start(DEMO_ROUTINES[0], "demo");
  a.edit((d) => updateSetField(d, 0, 0, "weight", "20"));
  await a.complete(0, 0);
  const rest = legacyActive(a.getSnapshot().active).draft.rest!;
  a.edit((d) => updateSetField(d, 0, 1, "weight", "501"));
  await expect(a.complete(0, 1)).rejects.toThrow("Revisa kg");
  expect(legacyActive(a.getSnapshot().active).draft.exercises[0].sets[1].done).toBe(false);
  expect(legacyActive(a.getSnapshot().active).draft.rest).toEqual(rest);
  await a.flush();
  const b = x.create();
  await b.restore();
  expect(legacyActive(b.getSnapshot().active).draft.rest).toEqual(rest);
  expect(remainingSeconds(rest, Date.parse("2026-10-24T15:00:25Z"))).toBe(65);
  expect(remainingSeconds(rest, Date.parse("2026-10-24T15:02:00Z"))).toBe(0);
});
