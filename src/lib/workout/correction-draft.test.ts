import { expect, it, vi } from "vitest";
import {
  workoutCorrectionSnapshotFixture,
  correctionUserId,
} from "../../test/fixtures/workout-correction";
import type { WorkoutCorrection } from "../mobile/workout-correction-contracts";
import {
  WorkoutCorrectionController,
  correctionDraftKey,
  type CorrectionStorage,
} from "./correction-draft";
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
  const send = vi.fn(async (input: WorkoutCorrection) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 3,
    status: "updated",
  }));
  const uuid = vi.fn(() => id(next++));
  return {
    data,
    storage,
    send,
    uuid,
    quota: (v: boolean) => {
      quota = v;
    },
    controller: new WorkoutCorrectionController(correctionUserId, storage, send, uuid),
  };
}
async function editing(x: ReturnType<typeof setup>) {
  await x.controller.restore();
  await x.controller.open(workoutCorrectionSnapshotFixture());
  const form = structuredClone(x.controller.getSnapshot().draft!.form);
  form.sets[0].reps = "9";
  await x.controller.change(form);
}
it("abrir sin editar no es pendiente; recupera texto intermedio sin tocar registro/descanso de otra clave", async () => {
  const x = setup();
  x.data.set("active-training", "rest-and-series");
  await x.controller.restore();
  await x.controller.open(workoutCorrectionSnapshotFixture());
  expect(x.controller.getSnapshot().draft?.changed).toBe(false);
  const form = structuredClone(x.controller.getSnapshot().draft!.form);
  form.sets[0].weightKg = "62,";
  await x.controller.change(form);
  const recovered = new WorkoutCorrectionController(correctionUserId, x.storage, x.send, x.uuid);
  await recovered.restore();
  expect(recovered.getSnapshot().draft?.form.sets[0].weightKg).toBe("62,");
  expect(recovered.getSnapshot().draft?.changed).toBe(true);
  expect(x.data.get("active-training")).toBe("rest-and-series");
  await expect(
    recovered.open({
      ...workoutCorrectionSnapshotFixture(),
      workout: { ...workoutCorrectionSnapshotFixture().workout, id: id(50) },
    }),
  ).rejects.toThrow();
});
it("cuota al congelar impide HTTP y conserva exactamente el intento al proteger/reintentar", async () => {
  const x = setup();
  await editing(x);
  x.quota(true);
  await expect(x.controller.submit()).rejects.toThrow();
  const request = structuredClone(x.controller.getSnapshot().pending!.request);
  expect(x.send).not.toHaveBeenCalled();
  expect(x.uuid).toHaveBeenCalledTimes(1);
  x.quota(false);
  await x.controller.retryStorage();
  await x.controller.submit();
  expect(x.send).toHaveBeenCalledWith(request);
  expect(x.uuid).toHaveBeenCalledTimes(1);
  expect(x.controller.getSnapshot().draft).toBeNull();
});
it("una escritura cuya relectura falla se reconcilia sin perder texto ni sobrescribir otro documento", async () => {
  const x = setup();
  await editing(x);
  const get = x.storage.get,
    compare = x.storage.compareAndSet;
  let fail = true,
    verify = false;
  x.storage.compareAndSet = async (...args) => {
    await compare(...args);
    verify = fail;
  };
  x.storage.get = async (key) => {
    if (verify) {
      verify = false;
      fail = false;
      throw Error("readback");
    }
    return get(key);
  };
  const form = structuredClone(x.controller.getSnapshot().draft!.form);
  form.sets[0].weightKg = "62,";
  await expect(x.controller.change(form)).rejects.toThrow();
  expect(x.controller.getSnapshot().dirty).toBe(true);
  expect(JSON.parse(x.data.get(x.controller.key)!).draft.form.sets[0].weightKg).toBe("62,");
  await x.controller.retryStorage();
  expect(x.controller.getSnapshot().dirty).toBe(false);
  expect(x.controller.getSnapshot().draft?.form.sets[0].weightKg).toBe("62,");
});
it("la petición protegida tiene que corresponder al formulario recuperado", async () => {
  const x = setup();
  await editing(x);
  x.send.mockRejectedValueOnce(Object.assign(Error("lost"), { code: "network" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const doc = JSON.parse(x.data.get(x.controller.key)!);
  doc.draft.form.sets[0].reps = "10";
  const raw = JSON.stringify(doc);
  x.data.set(x.controller.key, raw);
  const restored = new WorkoutCorrectionController(correctionUserId, x.storage, x.send, x.uuid);
  await restored.restore();
  expect(restored.getSnapshot().blocked).toBe(true);
  expect(x.data.get(x.controller.key)).toBe(raw);
  expect(x.send).toHaveBeenCalledTimes(1);
});
it("recarga después de respuesta perdida repite documento y no genera otro ID", async () => {
  const x = setup();
  await editing(x);
  x.send.mockRejectedValueOnce(Object.assign(Error("lost"), { code: "network" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const request = structuredClone(x.controller.getSnapshot().pending!.request);
  x.controller.dispose();
  const recovered = new WorkoutCorrectionController(correctionUserId, x.storage, x.send, x.uuid);
  await recovered.restore();
  await recovered.submit();
  expect(x.send.mock.calls.map((c) => c[0])).toEqual([request, request]);
  expect(x.uuid).toHaveBeenCalledTimes(1);
  expect(recovered.getSnapshot().confirmation?.status).toBe("updated");
  expect(recovered.getSnapshot().pending).toBeNull();
});
it("confirmación incompatible conserva el intento, sin limpiar ni anunciar guardado", async () => {
  const x = setup();
  await editing(x);
  x.send.mockImplementationOnce(async (input) => ({
    version: 1,
    requestId: id(999),
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "updated",
  }));
  await expect(x.controller.submit()).rejects.toThrow();
  expect(x.controller.getSnapshot().pending).not.toBeNull();
  expect(x.controller.getSnapshot().confirmation).toBeNull();
});
it("fallo local después del commit retiene la confirmación y reintenta solo limpieza", async () => {
  const x = setup();
  await editing(x);
  x.send.mockImplementationOnce(async (input) => {
    x.quota(true);
    return {
      version: 1,
      requestId: input.requestId,
      workoutId: input.workoutId,
      revision: input.expectedRevision + 2,
      status: "updated",
    };
  });
  await expect(x.controller.submit()).rejects.toThrow();
  expect(x.controller.getSnapshot().confirmation?.status).toBe("updated");
  expect(x.controller.getSnapshot().pending).not.toBeNull();
  x.quota(false);
  await x.controller.retryStorage();
  expect(x.send).toHaveBeenCalledTimes(1);
  expect(x.controller.getSnapshot().draft).toBeNull();
});
it("dos ventanas conservan ambas propuestas; releer exige confirmar descarte de memoria", async () => {
  const x = setup(),
    other = new WorkoutCorrectionController(correctionUserId, x.storage, x.send, x.uuid);
  await x.controller.restore();
  await other.restore();
  await x.controller.open(workoutCorrectionSnapshotFixture());
  await expect(other.open(workoutCorrectionSnapshotFixture())).rejects.toThrow();
  const saved = x.data.get(x.controller.key);
  expect(other.getSnapshot().dirty).toBe(true);
  await expect(other.reloadLocal()).rejects.toThrow();
  expect(x.data.get(x.controller.key)).toBe(saved);
  await other.reloadLocal(true);
  expect(other.getSnapshot().dirty).toBe(false);
  const form = structuredClone(other.getSnapshot().draft!.form);
  form.sets[0].reps = "10";
  await other.change(form);
  await expect(
    x.controller.change({ ...x.controller.getSnapshot().draft!.form, note: "Propuesta propia" }),
  ).rejects.toThrow();
  expect(other.getSnapshot().draft?.form.sets[0].reps).toBe("10");
  expect(x.controller.getSnapshot().draft?.form.note).toBe("Propuesta propia");
});
it("releer también pide confirmar cuando otra ventana reemplazó un borrador que parecía protegido", async () => {
  const x = setup();
  await editing(x);
  const other = new WorkoutCorrectionController(correctionUserId, x.storage, x.send, x.uuid);
  await other.restore();
  const form = structuredClone(other.getSnapshot().draft!.form);
  form.sets[0].reps = "10";
  await other.change(form);
  expect(x.controller.getSnapshot().dirty).toBe(false);
  await expect(x.controller.reloadLocal()).rejects.toThrow();
  await expect(x.controller.restore()).rejects.toThrow();
  expect(x.controller.getSnapshot().draft?.form.sets[0].reps).toBe("9");
  await x.controller.reloadLocal(true);
  expect(x.controller.getSnapshot().draft?.form.sets[0].reps).toBe("10");
});
it("formato futuro o cuenta ajena quedan intactos y bloquean edición sin consumir contenido", async () => {
  for (const raw of [
    JSON.stringify({ version: 2, userId: correctionUserId, future: "preserve" }),
    JSON.stringify({ version: 1, userId: id(999), draft: null, pending: null }),
  ]) {
    const x = setup();
    x.data.set(correctionDraftKey(correctionUserId), raw);
    await x.controller.restore();
    expect(x.controller.getSnapshot().blocked).toBe(true);
    expect(x.controller.getSnapshot().draft).toBeNull();
    await expect(x.controller.open(workoutCorrectionSnapshotFixture())).rejects.toThrow();
    expect(x.data.get(x.controller.key)).toBe(raw);
    expect(x.send).not.toHaveBeenCalled();
  }
});
it("conflicto remoto requiere revisión explícita y conserva los campos remotos no editados", async () => {
  const x = setup();
  await editing(x);
  x.send.mockRejectedValueOnce(Object.assign(Error("conflict"), { code: "conflict" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const frozen = structuredClone(x.controller.getSnapshot().pending!.request),
    raw = x.data.get(x.controller.key);
  const latest = workoutCorrectionSnapshotFixture();
  latest.workout.revision++;
  latest.workout.sets[0].metrics.weightKg = 70;
  latest.workout.note = "Remota";
  x.controller.prepareComparison(latest);
  expect(x.data.get(x.controller.key)).toBe(raw);
  expect(x.controller.getSnapshot().draft?.base.workout.revision).toBe(3);
  await x.controller.acceptComparison();
  await x.controller.submit();
  const sent = x.send.mock.calls[1][0];
  expect(sent.requestId).not.toBe(frozen.requestId);
  expect(sent.expectedRevision).toBe(4);
  expect(sent.note).toBe("Remota");
  expect(sent.sets[0].metrics).toMatchObject({ weightKg: 70, reps: 9 });
});
it("comparación con una serie desaparecida exige aceptar sus cambios no aplicables", async () => {
  const x = setup(),
    base = workoutCorrectionSnapshotFixture();
  base.workout.sets.push({ ...structuredClone(base.workout.sets[0]), id: id(7), setNumber: 2 });
  await x.controller.restore();
  await x.controller.open(base);
  const form = structuredClone(x.controller.getSnapshot().draft!.form);
  form.sets[0].reps = "9";
  form.note = "Conservar nota";
  await x.controller.change(form);
  x.send.mockRejectedValueOnce(Object.assign(Error("conflict"), { code: "conflict" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const latest = structuredClone(base);
  latest.workout.revision++;
  latest.workout.sets.shift();
  x.controller.prepareComparison(latest);
  expect(x.controller.getSnapshot().comparison?.unapplied).toHaveLength(1);
  await expect(x.controller.acceptComparison()).rejects.toThrow();
  expect(x.controller.getSnapshot().draft?.base.workout.revision).toBe(3);
  await x.controller.acceptComparison(true);
  expect(x.controller.getSnapshot().draft?.form.note).toBe("Conservar nota");
  expect(x.controller.getSnapshot().draft?.form.sets.map((s) => s.id)).toEqual([id(7)]);
});
it("removed conserva texto e intento hasta descarte explícito", async () => {
  const x = setup();
  await editing(x);
  x.send.mockImplementationOnce(async (input) => ({
    version: 1,
    requestId: input.requestId,
    workoutId: input.workoutId,
    revision: input.expectedRevision + 1,
    status: "removed",
  }));
  expect((await x.controller.submit()).status).toBe("removed");
  expect(x.controller.getSnapshot().pending?.issue).toBe("removed");
  expect(x.controller.getSnapshot().draft?.form.sets[0].reps).toBe("9");
  await expect(x.controller.submit()).rejects.toThrow();
  await x.controller.discard();
  expect(x.controller.getSnapshot().draft).toBeNull();
});
it("un rechazo de datos permite revisar el formulario con nuevo intento, sin cambiar su base", async () => {
  const x = setup();
  await editing(x);
  x.send.mockRejectedValueOnce(Object.assign(Error("invalid"), { code: "invalid_input" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const first = x.controller.getSnapshot().pending!.request;
  await expect(x.controller.change(x.controller.getSnapshot().draft!.form)).rejects.toThrow();
  await x.controller.resumeEditing();
  const form = structuredClone(x.controller.getSnapshot().draft!.form);
  form.note = "Datos revisados";
  await x.controller.change(form);
  await x.controller.submit();
  expect(x.send.mock.calls[1][0]).toMatchObject({
    expectedRevision: first.expectedRevision,
    note: "Datos revisados",
  });
  expect(x.send.mock.calls[1][0].requestId).not.toBe(first.requestId);
});
it("reintentar un rechazo de permisos mantiene el cuerpo; no permite saltar un conflicto", async () => {
  const x = setup();
  await editing(x);
  x.send.mockRejectedValueOnce(Object.assign(Error("forbidden"), { code: "forbidden" }));
  await expect(x.controller.submit()).rejects.toThrow();
  const first = x.controller.getSnapshot().pending!.request;
  await x.controller.retryRejected();
  await x.controller.submit();
  expect(x.send.mock.calls[1][0]).toEqual(first);
  expect(x.uuid).toHaveBeenCalledTimes(1);
  const y = setup();
  await editing(y);
  y.send.mockRejectedValueOnce(Object.assign(Error("conflict"), { code: "conflict" }));
  await expect(y.controller.submit()).rejects.toThrow();
  await expect(y.controller.retryRejected()).rejects.toThrow();
  await expect(y.controller.resumeEditing()).rejects.toThrow();
});
it("la salida de una corrección resuelta retira también confirmación y comparación de memoria", async () => {
  const x = setup();
  await editing(x);
  await x.controller.submit();
  expect(x.controller.getSnapshot().confirmation).not.toBeNull();
  const release = x.controller.pauseWrites();
  await x.controller.clearForLogout();
  release();
  expect(x.controller.getSnapshot()).toMatchObject({
    draft: null,
    pending: null,
    confirmation: null,
    comparison: null,
  });
});
it("un recibo tardío después de desmontar no limpia el borrador original", async () => {
  const x = setup();
  await editing(x);
  let release: (input: Awaited<ReturnType<typeof x.send>>) => void = () => {};
  x.send.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }) as ReturnType<typeof x.send>,
  );
  const pending = x.controller.submit();
  await vi.waitFor(() => expect(x.send).toHaveBeenCalledTimes(1));
  const request = x.send.mock.calls[0][0],
    raw = x.data.get(x.controller.key);
  x.controller.dispose();
  release({
    version: 1,
    requestId: request.requestId,
    workoutId: request.workoutId,
    revision: request.expectedRevision + 1,
    status: "updated",
  });
  await expect(pending).rejects.toThrow();
  expect(x.data.get(x.controller.key)).toBe(raw);
});
it("reservar salida bloquea nuevas escrituras y la limpieza valida generación después de esperar", async () => {
  const x = setup();
  await x.controller.restore();
  const release = x.controller.pauseWrites();
  await expect(x.controller.open(workoutCorrectionSnapshotFixture())).rejects.toThrow();
  release();
  const releaseAgain = x.controller.pauseWrites();
  let resume: (v: string | null) => void = () => {};
  x.storage.get = vi.fn<CorrectionStorage["get"]>(
    () =>
      new Promise((r) => {
        resume = r;
      }),
  );
  const clearing = x.controller.clearForLogout();
  await vi.waitFor(() => expect(x.storage.get).toHaveBeenCalled());
  x.controller.dispose();
  resume(null);
  await expect(clearing).rejects.toThrow();
  expect(x.data.has(x.controller.key)).toBe(false);
  releaseAgain();
});
