import { expect, it, vi } from "vitest";
import { workoutRemovalSnapshotFixture, removalUserId } from "../../test/fixtures/workout-removal";
import { workoutCorrectionSnapshotFixture } from "../../test/fixtures/workout-correction";
import type { WorkoutRemoval } from "../mobile/workout-removal-contracts";
import { WorkoutCorrectionController, type CorrectionStorage } from "./correction-draft";
import {
  WorkoutRemovalController,
  removalDraftKey,
  workoutRemovalDraftSchema,
} from "./removal-draft";
const id = (n: number) => `af214a00-0000-4000-8000-${String(n).padStart(12, "0")}`;
function setup() {
  const data = new Map<string, string>();
  let quota = false,
    next = 100;
  const storage: CorrectionStorage = {
    get: async (k) => data.get(k) ?? null,
    compareAndSet: async (key, before, value) => {
      if (quota) throw Error("quota");
      if ((data.get(key) ?? null) !== before)
        throw Object.assign(Error("conflict"), { reason: "conflict" });
      data.set(key, value);
    },
  };
  const send = vi.fn(async (input: WorkoutRemoval) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "deleted",
  }));
  const uuid = vi.fn(() => id(next++));
  const release = vi.fn();
  const reserve = vi.fn(async () => release);
  const onRemoved = vi.fn<(id: string) => Promise<void>>(async () => {});
  const ports = { send, uuid, reserve, onRemoved };
  return {
    data,
    storage,
    send,
    uuid,
    release,
    reserve,
    onRemoved,
    ports,
    quota: (v: boolean) => {
      quota = v;
    },
    controller: new WorkoutRemovalController(removalUserId, storage, ports),
  };
}
it("abrir/recuperar sin confirmar no escribe ni envía; claves propias normalizadas", async () => {
  const x = setup();
  await x.controller.restore();
  expect(x.data.size).toBe(0);
  expect(x.send).not.toHaveBeenCalled();
  expect(removalDraftKey(removalUserId.toUpperCase())).toBe(x.controller.key);
});
it("congela revisión/snapshot y limpia solo después de recibo válido; conserva otras claves", async () => {
  const x = setup();
  x.data.set("active", "rest");
  await x.controller.restore();
  await x.controller.confirm(workoutRemovalSnapshotFixture());
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.uuid).toHaveBeenCalledTimes(1);
  expect(x.onRemoved).toHaveBeenCalledWith(workoutRemovalSnapshotFixture().workout.id);
  expect(x.release).toHaveBeenCalledTimes(1);
  expect(x.controller.getSnapshot().pending).toBeNull();
  expect(x.controller.getSnapshot().confirmation?.status).toBe("deleted");
  expect(x.data.get("active")).toBe("rest");
});
it("cuota al congelar conserva intento y evita HTTP; recuperar guardado usa mismo nonce", async () => {
  const x = setup();
  await x.controller.restore();
  x.quota(true);
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const pending = structuredClone(x.controller.getSnapshot().pending);
  expect(pending).not.toBeNull();
  expect(x.send).not.toHaveBeenCalled();
  expect(x.release).toHaveBeenCalledTimes(1);
  x.quota(false);
  await x.controller.retryStorage();
  await x.controller.retry();
  expect(x.send).toHaveBeenCalledWith(pending!.request);
  expect(x.uuid).toHaveBeenCalledTimes(1);
});
it("pérdida de respuesta y recarga reenvían JSON idéntico con la revisión original", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValueOnce(Error("lost after commit"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const request = structuredClone(x.controller.getSnapshot().pending!.request);
  x.controller.dispose();
  const restored = new WorkoutRemovalController(removalUserId, x.storage, x.ports);
  await restored.restore();
  await restored.retry();
  expect(x.send.mock.calls.map((c) => c[0])).toEqual([request, request]);
  expect(x.uuid).toHaveBeenCalledTimes(1);
  expect(restored.getSnapshot().confirmation?.workoutId).toBe(request.workoutId);
});
it("confirmación ajena o no posterior conserva intento sin éxito ni limpieza", async () => {
  for (const patch of [
    { requestId: id(900) },
    { workoutId: id(901) },
    { revision: 0 },
    { status: "updated" },
  ]) {
    const x = setup();
    await x.controller.restore();
    x.send.mockImplementationOnce(async (req) => ({
      version: 1,
      requestId: req.requestId,
      workoutId: req.workoutId,
      revision: req.expectedRevision + 1,
      status: "deleted",
      ...patch,
    }));
    await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
    expect(x.controller.getSnapshot().pending).not.toBeNull();
    expect(x.controller.getSnapshot().confirmation).toBeNull();
    expect(x.onRemoved).not.toHaveBeenCalled();
  }
});
it("cuota tras commit retiene recibo en memoria y reintenta limpieza sin repetir HTTP", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockImplementationOnce(async (req) => {
    x.quota(true);
    return {
      version: 1,
      requestId: req.requestId,
      workoutId: req.workoutId,
      revision: req.expectedRevision + 1,
      status: "deleted",
    };
  });
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  expect(x.controller.getSnapshot().confirmation).not.toBeNull();
  expect(x.controller.getSnapshot().error).toContain("El servidor confirmó la eliminación");
  expect(JSON.parse(x.data.get(x.controller.key)!)).not.toHaveProperty("confirmation");
  x.quota(false);
  await x.controller.retryStorage();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.controller.getSnapshot().pending).toBeNull();
});
it("fallo de limpieza de corrección después de commit conserva intención y recibo para reintentar solo limpieza", async () => {
  const x = setup();
  await x.controller.restore();
  x.onRemoved.mockRejectedValueOnce(Error("correction changed"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  expect(x.controller.getSnapshot().pending).not.toBeNull();
  await x.controller.retry();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.onRemoved).toHaveBeenCalledTimes(2);
  expect(x.controller.getSnapshot().pending).toBeNull();
});
it("restauración posterior a cuota tras commit debe verificar recibo contra servidor", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockImplementationOnce(async (req) => {
    x.quota(true);
    return {
      version: 1,
      requestId: req.requestId,
      workoutId: req.workoutId,
      revision: req.expectedRevision + 1,
      status: "deleted",
    };
  });
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  x.controller.dispose();
  x.quota(false);
  const other = new WorkoutRemovalController(removalUserId, x.storage, x.ports);
  await other.restore();
  expect(other.getSnapshot().confirmation).toBeNull();
  await other.retry();
  expect(x.send).toHaveBeenCalledTimes(2);
});
it("rechazo de revisión recuperado no reintenta a ciegas ni acepta otra base sin revisión explícita", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValueOnce(Object.assign(Error("changed"), { code: "conflict" }));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const request = x.controller.getSnapshot().pending!.request;
  const next = workoutRemovalSnapshotFixture();
  next.workout.revision += 2;
  await expect(x.controller.confirm(next)).rejects.toThrow();
  await expect(x.controller.retry()).rejects.toThrow();
  expect(x.send).toHaveBeenCalledTimes(1);
  await x.controller.acceptLatest(next);
  expect(x.controller.getSnapshot().pending).toBeNull();
  await x.controller.confirm(next);
  expect(x.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: next.workout.revision }),
  );
  expect(x.send.mock.calls[1][0].requestId).not.toBe(request.requestId);
});
it("el rechazo recuperado mantiene causa; permisos/plazo/ausencia nunca limpian ni confirman", async () => {
  for (const code of ["forbidden", "edit_locked", "not_found", "invalid_input"]) {
    const x = setup();
    await x.controller.restore();
    x.send.mockRejectedValueOnce(Object.assign(Error(code), { code }));
    await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
    const other = new WorkoutRemovalController(removalUserId, x.storage, x.ports);
    await other.restore();
    expect(other.getSnapshot().pending?.issue).toBe(code);
    await expect(other.retry()).rejects.toThrow();
    expect(other.getSnapshot().confirmation).toBeNull();
    expect(x.send).toHaveBeenCalledTimes(1);
  }
});
it("dos ventanas no sobreescriben intentos y relectura requiere confirmar memoria protegida", async () => {
  const x = setup(),
    other = new WorkoutRemovalController(removalUserId, x.storage, x.ports);
  await x.controller.restore();
  await other.restore();
  x.send.mockRejectedValue(Error("offline"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const raw = x.data.get(x.controller.key);
  await expect(other.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.data.get(x.controller.key)).toBe(raw);
  await expect(other.reloadLocal()).rejects.toThrow();
  await other.reloadLocal(true);
  expect(other.getSnapshot().dirty).toBe(false);
});
it("nunca reemplaza revisión de un intento incierto por una consulta nueva", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValueOnce(Error("lost"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const next = workoutRemovalSnapshotFixture();
  next.workout.revision++;
  await expect(x.controller.acceptLatest(next)).rejects.toThrow();
  expect(x.uuid).toHaveBeenCalledTimes(1);
});
it("bytes futuros/ajenos/incoherentes y confirmación local falsa se preservan y bloquean HTTP", async () => {
  for (const invalid of [
    { version: 2, userId: removalUserId, pending: null },
    { version: 1, userId: id(900), pending: null },
    { version: 1, userId: removalUserId, pending: null, confirmation: { status: "deleted" } },
  ]) {
    const x = setup(),
      raw = JSON.stringify(invalid);
    x.data.set(x.controller.key, raw);
    await x.controller.restore();
    expect(x.controller.getSnapshot().blocked).toBe(true);
    await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
    expect(x.data.get(x.controller.key)).toBe(raw);
    expect(x.send).not.toHaveBeenCalled();
  }
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValue(Error("lost"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const doc = JSON.parse(x.data.get(x.controller.key)!);
  doc.pending.review.workout.revision++;
  expect(workoutRemovalDraftSchema.safeParse(doc).success).toBe(false);
});
it("relectura fallida conserva intención conocida en memoria, exige aceptación de otra relectura", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValue(Error("offline"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const known = x.controller.getSnapshot().pending;
  x.data.set(x.controller.key, '{"version":2}');
  await x.controller.reloadLocal(true);
  expect(x.controller.getSnapshot().blocked).toBe(true);
  expect(x.controller.getSnapshot().pending).toEqual(known);
  await expect(x.controller.reloadLocal()).rejects.toThrow();
});
it("otra ventana que reemplaza disco antes de retry impide HTTP y conserva ambas copias", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValue(Error("offline"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  x.data.set(x.controller.key, '{"version":2}');
  await expect(x.controller.retry()).rejects.toThrow();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.data.get(x.controller.key)).toBe('{"version":2}');
});
it("cuenta/plazo antiguos se rechazan antes de crear nonce; reintento incierto conserva ventana original", async () => {
  const x = setup();
  await x.controller.restore();
  const foreign = workoutRemovalSnapshotFixture();
  foreign.userId = id(900);
  await expect(x.controller.confirm(foreign)).rejects.toThrow();
  const old = workoutRemovalSnapshotFixture();
  old.workout.performedOn = "2020-01-01";
  await expect(x.controller.confirm(old)).rejects.toThrow();
  expect(x.uuid).not.toHaveBeenCalled();
});
it("reserva de correcciones fallida impide congelar/enviar; libera después de cada salida", async () => {
  const x = setup();
  await x.controller.restore();
  x.reserve.mockRejectedValueOnce(Error("correction pending"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  expect(x.uuid).not.toHaveBeenCalled();
  expect(x.controller.getSnapshot().pending).toBeNull();
  expect(x.send).not.toHaveBeenCalled();
});
it("salida reserva antes de esperar y bloquea pendientes/desconocidos; limpiar cuenta conserva claves ajenas", async () => {
  const x = setup();
  await x.controller.restore();
  const release = x.controller.pauseWrites();
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  await x.controller.clearForLogout();
  release();
  x.send.mockRejectedValue(Error("offline"));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const held = x.controller.pauseWrites();
  await expect(x.controller.clearForLogout()).rejects.toThrow();
  held();
  await expect(x.controller.discard()).rejects.toThrow();
  await x.controller.discard(true);
  expect(x.controller.getSnapshot().pending).toBeNull();
});
it("respuesta tardía tras dispose no limpia intento/corrección ni publica éxito de otra cuenta", async () => {
  const x = setup();
  await x.controller.restore();
  let resolve!: (r: Awaited<ReturnType<typeof x.send>>) => void;
  x.send.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const result = x.controller.confirm(workoutRemovalSnapshotFixture());
  while (!x.send.mock.calls.length) await Promise.resolve();
  const req = x.send.mock.calls[0][0];
  x.controller.dispose();
  resolve({
    version: 1,
    requestId: req.requestId,
    workoutId: req.workoutId,
    revision: req.expectedRevision + 1,
    status: "deleted",
  });
  await expect(result).rejects.toThrow();
  expect(JSON.parse(x.data.get(x.controller.key)!).pending.request).toEqual(req);
  expect(x.onRemoved).not.toHaveBeenCalled();
});
it("corrección: reserva impide borrar propuestas del mismo resultado y conserva otros resultados", async () => {
  const x = setup(),
    c = new WorkoutCorrectionController(removalUserId, x.storage, async () => null, x.uuid);
  await c.restore();
  await c.open(workoutCorrectionSnapshotFixture());
  let release = c.reserveForWorkoutRemoval(workoutRemovalSnapshotFixture().workout.id);
  await c.clearRemovedWorkout(workoutRemovalSnapshotFixture().workout.id);
  release();
  expect(c.getSnapshot().draft).toBeNull();
  await c.open(workoutCorrectionSnapshotFixture());
  const form = structuredClone(c.getSnapshot().draft!.form);
  form.note = "Mi propuesta";
  await c.change(form);
  expect(() => c.reserveForWorkoutRemoval(workoutRemovalSnapshotFixture().workout.id)).toThrow();
  expect(c.getSnapshot().paused).toBe(false);
  release = c.reserveForWorkoutRemoval(id(900));
  await c.flush();
  await c.clearRemovedWorkout(id(900));
  release();
  expect(c.getSnapshot().draft?.form.note).toBe("Mi propuesta");
});
it("corrección: limpieza exige reserva y CAS, nunca retira la propuesta de otra ventana", async () => {
  const x = setup(),
    c = new WorkoutCorrectionController(removalUserId, x.storage, async () => null, x.uuid);
  await c.restore();
  await c.open(workoutCorrectionSnapshotFixture());
  await expect(c.clearRemovedWorkout(workoutRemovalSnapshotFixture().workout.id)).rejects.toThrow();
  const release = c.reserveForWorkoutRemoval(workoutRemovalSnapshotFixture().workout.id);
  const raw = x.data.get(c.key)!;
  const modified = JSON.parse(raw);
  modified.draft.form.note = "Otra ventana";
  modified.draft.changed = true;
  x.data.set(c.key, JSON.stringify(modified));
  await expect(c.clearRemovedWorkout(workoutRemovalSnapshotFixture().workout.id)).rejects.toThrow();
  release();
  expect(JSON.parse(x.data.get(c.key)!).draft.form.note).toBe("Otra ventana");
});

it("cuota al aceptar nueva revisión conserva el rechazo original hasta verificar limpieza", async () => {
  const x = setup();
  await x.controller.restore();
  x.send.mockRejectedValueOnce(Object.assign(Error("changed"), { code: "conflict" }));
  await expect(x.controller.confirm(workoutRemovalSnapshotFixture())).rejects.toThrow();
  const pending = structuredClone(x.controller.getSnapshot().pending);
  const next = workoutRemovalSnapshotFixture();
  next.workout.revision++;
  x.quota(true);
  await expect(x.controller.acceptLatest(next)).rejects.toThrow();
  expect(x.controller.getSnapshot().pending).toEqual(pending);
  x.quota(false);
  await x.controller.retryStorage();
  await x.controller.acceptLatest(next);
  expect(x.controller.getSnapshot().pending).toBeNull();
  expect(x.send).toHaveBeenCalledTimes(1);
});
