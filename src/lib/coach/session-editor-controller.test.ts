import { expect, it, vi } from "vitest";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import type { CoachSessionRow } from "@/lib/data/coach-programs";
import {
  coachEditorDraftKey,
  decodeCoachEditorDraft,
  type CoachEditorStorage,
} from "./typed-editor-draft";
import { CoachSessionEditorController } from "./session-editor-controller";
import type { CoachEditorStoredEntry } from "./editor-browser";
const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const rowId = crypto.randomUUID(),
  exerciseId = crypto.randomUUID();
function source(): CoachSessionRow {
  return {
    id: scope.sessionId,
    revision: 2,
    title: null,
    weekday: null,
    weekNumber: 1,
    label: "A",
    position: 0,
    exercises: [
      {
        id: rowId,
        exerciseId,
        recordType: "weight_duration",
        prescribed: parsePrescriptionInput(defaultPrescriptionInput("weight_duration")),
        name: "Carga y tiempo",
        muscleGroup: "Core",
        equipment: null,
        isBodyweight: false,
        incrementKg: 2.5,
        archived: false,
        note: null,
        restSeconds: 90,
        supersetId: null,
        supersetRestSeconds: null,
        position: 0,
        alternatives: [],
      },
    ],
  };
}
function setup(initial = source()) {
  const data = new Map<string, string>();
  let blocked = false;
  const storage: CoachEditorStorage = {
    get: async (key) => data.get(key) ?? null,
    compareAndSet: async (key, before, next) => {
      if (blocked) throw Error("quota");
      if ((data.get(key) ?? null) !== before)
        throw Object.assign(Error("conflict"), { reason: "conflict" });
      if (next === null) data.delete(key);
      else data.set(key, next);
    },
  };
  const mutate = vi.fn(
    async (input: { request: { id: string; revision: number } }): Promise<unknown> => ({
      ok: true,
      result: {
        version: 2,
        id: input.request.id,
        sessionId: scope.sessionId,
        revision: input.request.revision + 1,
        status: "applied",
      },
    }),
  );
  const review = vi.fn(async () => ({ ...initial, revision: 3 }));
  const legacy = vi.fn<(input: { raw: string }) => Promise<unknown>>(async () => ({
    ok: true,
    revision: 3,
  }));
  const discover = () => ({
    ok: true,
    entries: [...data]
      .map(([key, raw]) => ({ key, entry: decodeCoachEditorDraft(raw, scope) }))
      .filter((entry): entry is CoachEditorStoredEntry => entry.entry.kind !== "empty"),
  });
  const deps = {
    storage,
    mutate,
    review,
    legacy,
    discover,
    remember: vi.fn(),
    createId: () => crypto.randomUUID(),
    now: () => "2026-10-28T12:00:00.000Z",
  };
  return {
    data,
    storage,
    mutate,
    review,
    legacy,
    deps,
    controller: new CoachSessionEditorController(scope, initial, [], deps),
    block: (value: boolean) => {
      blocked = value;
    },
  };
}
function edit(x: ReturnType<typeof setup>, weight = "12,35") {
  const input = defaultPrescriptionInput("weight_duration");
  input.target.targetWeightKg = weight;
  x.controller.change((draft) => ({
    ...draft,
    edits: { [rowId]: { id: rowId, exerciseId, targets: { kind: "replace", input } } },
  }));
}
it("protege texto parcial y base antes de preparar un envío", async () => {
  const x = setup();
  await x.controller.init();
  edit(x, "12,");
  await x.controller.flush();
  expect(x.controller.getSnapshot().storage).toBe("saved");
  expect(x.controller.getSnapshot().draft.base?.revision).toBe(2);
  await x.controller.save();
  expect(x.mutate).not.toHaveBeenCalled();
  expect(x.controller.getSnapshot().draft.edits[rowId].targets).toMatchObject({
    kind: "replace",
    input: { target: { targetWeightKg: "12," } },
  });
});
it("cuota llena impide enviar y reintenta exactamente el mismo intento después", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  x.block(true);
  await x.controller.save();
  expect(x.mutate).not.toHaveBeenCalled();
  const pending = x.controller.getSnapshot().draft.pending;
  expect(pending).not.toBeNull();
  expect(x.controller.getSnapshot().storage).toBe("error");
  x.block(false);
  await x.controller.retry();
  expect(x.mutate).toHaveBeenCalledTimes(1);
  expect(x.mutate.mock.calls[0][0].request).toEqual(pending);
  expect(x.controller.getSnapshot().draft.pending).toBeNull();
  expect(x.data.size).toBe(0);
});
it("respuesta perdida conserva ID, cuerpo y revisión al recargar y reintentar", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  x.mutate.mockRejectedValueOnce(Error("response lost"));
  await x.controller.save();
  const frozen = x.controller.getSnapshot().draft.pending!;
  const recovered = new CoachSessionEditorController(scope, source(), [], x.deps);
  await recovered.init();
  await recovered.retry();
  expect(x.mutate.mock.calls.map((call) => call[0].request)).toEqual([frozen, frozen]);
  expect(recovered.getSnapshot().draft.pending).toBeNull();
});
it("dos clics no reservan dos operaciones y limpiar tras confirmar no vuelve a enviar", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  await x.controller.flush();
  x.mutate.mockImplementationOnce(async (input) => {
    x.block(true);
    return {
      ok: true,
      result: {
        version: 2,
        id: input.request.id,
        sessionId: scope.sessionId,
        revision: 3,
        status: "applied",
      },
    };
  });
  await Promise.all([x.controller.save(), x.controller.save()]);
  expect(x.mutate).toHaveBeenCalledTimes(1);
  expect(x.controller.getSnapshot().confirmation).not.toBeNull();
  x.block(false);
  await x.controller.retry();
  expect(x.mutate).toHaveBeenCalledTimes(1);
  expect(x.data.size).toBe(0);
});
it("no acepta recibos ajenos o malformados como confirmación", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  x.mutate.mockResolvedValueOnce({
    ok: true,
    result: {
      version: 2,
      id: crypto.randomUUID(),
      sessionId: scope.sessionId,
      revision: 3,
      status: "applied",
    },
  });
  await x.controller.save();
  expect(x.controller.getSnapshot().draft.pending).not.toBeNull();
  expect(x.controller.getSnapshot().confirmation).toBeNull();
});
it("conflicto revisado conserva dimensiones nuevas y exige otro guardado explícito", async () => {
  const x = setup();
  await x.controller.init();
  edit(x, "20,5");
  x.mutate.mockResolvedValueOnce({ ok: false, reason: "conflict" });
  await x.controller.save();
  const newer = source();
  newer.revision = 8;
  newer.exercises[0].prescribed.target.targetDurationSeconds = 90;
  x.review.mockResolvedValue(newer);
  await x.controller.review();
  expect(x.controller.getSnapshot().comparison?.revision).toBe(8);
  await x.controller.approveReview();
  expect(x.mutate).toHaveBeenCalledTimes(1);
  const edited = x.controller.getSnapshot().draft.edits[rowId].targets;
  expect(edited).toMatchObject({
    kind: "replace",
    input: { target: { targetWeightKg: "20,5", targetDurationSeconds: "90" } },
  });
  expect(x.controller.getSnapshot().draft.revision).toBe(8);
  expect(x.controller.getSnapshot().draft.pending).toBeNull();
});
it("un formato futuro o descubrimiento incompleto no desaparecen ni se vuelven un inicio limpio", async () => {
  const x = setup(),
    key = coachEditorDraftKey({ ...scope, id: crypto.randomUUID() });
  x.data.set(key, '{"version":99}');
  await x.controller.init();
  edit(x);
  await x.controller.save();
  expect(x.mutate).not.toHaveBeenCalled();
  expect(x.data.get(key)).toBe('{"version":99}');
  expect(x.controller.getSnapshot().blocked?.entry.kind).toBe("unknown");
  const blocked = new CoachSessionEditorController(scope, source(), [], {
    ...x.deps,
    discover: () => ({ ok: false, entries: [] }),
  });
  await blocked.init();
  expect(blocked.getSnapshot().storage).toBe("error");
});
it("dos pestañas conservan ambas propuestas en memoria y no envían la que no se pudo proteger", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  await x.controller.flush();
  const id = x.controller.getSnapshot().draft.id;
  const second = new CoachSessionEditorController(scope, source(), [], x.deps);
  await second.init(id);
  x.controller.change((d) => ({ ...d, title: "Primera" }));
  await x.controller.flush();
  second.change((d) => ({ ...d, title: "Segunda" }));
  await second.save();
  expect(second.getSnapshot().draft.title).toBe("Segunda");
  expect(second.getSnapshot().storage).toBe("error");
  expect(x.mutate).not.toHaveBeenCalled();
});
it("una operación nueva retira el mensaje anterior antes de esperar su confirmación", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  await x.controller.save();
  expect(x.controller.getSnapshot().lastResult).not.toBeNull();
  let resolve!: (value: unknown) => void;
  x.mutate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const command = x.controller.command("order", { ids: [rowId] });
  await vi.waitFor(() => expect(x.mutate).toHaveBeenCalledTimes(2));
  expect(x.controller.getSnapshot().lastResult).toBeNull();
  const pending = x.controller.getSnapshot().draft.pending!;
  resolve({
    ok: true,
    result: {
      version: 2,
      id: pending.id,
      sessionId: scope.sessionId,
      revision: 4,
      status: "applied",
    },
  });
  await command;
});
it("marca la fila cuyo mínimo supera el máximo sin perder las otras ediciones", async () => {
  const initial = source();
  initial.exercises[0].recordType = null;
  initial.exercises[0].prescribed = parsePrescriptionInput(defaultPrescriptionInput(null));
  const x = setup(initial);
  await x.controller.init();
  const input = defaultPrescriptionInput(null);
  input.target.repsMin = "15";
  x.controller.change((draft) => ({
    ...draft,
    edits: { [rowId]: { id: rowId, exerciseId, targets: { kind: "replace", input } } },
  }));
  await x.controller.save();
  expect(x.mutate).not.toHaveBeenCalled();
  expect(x.controller.getSnapshot().errors[rowId]).toContain("mínimo");
  expect(x.controller.getSnapshot().draft.edits[rowId].targets).toMatchObject({
    input: { target: { repsMin: "15" } },
  });
});
it("la entrada conserva su base mientras llega una revisión nueva del servidor", async () => {
  const x = setup();
  await x.controller.init();
  x.controller.change((draft) => ({
    ...draft,
    edits: { [rowId]: { id: rowId, exerciseId, note: "Nota pendiente" } },
  }));
  const newer = source();
  newer.revision = 8;
  newer.exercises[0].prescribed.target.targetDurationSeconds = 90;
  x.controller.receiveSource(newer);
  const goals = x.controller.goals(newer.exercises[0]);
  expect(goals).toMatchObject({ target: { targetDurationSeconds: "" } });
  if (goals.mode !== "uniform") throw Error("fixture");
  goals.target.targetWeightKg = "20";
  x.controller.change((draft) => ({
    ...draft,
    edits: { [rowId]: { ...draft.edits[rowId], targets: { kind: "replace", input: goals } } },
  }));
  x.review.mockResolvedValue(newer);
  await x.controller.review();
  await x.controller.approveReview();
  expect(x.controller.getSnapshot().draft.edits[rowId].targets).toMatchObject({
    input: { target: { targetWeightKg: "20", targetDurationSeconds: "90" } },
  });
});
it("un borrador anterior conserva los bytes del intento y no acepta confirmaciones ajenas", async () => {
  const x = setup(),
    id = crypto.randomUUID(),
    copyId = crypto.randomUUID();
  const original = {
    version: 3,
    ...scope,
    id,
    revision: 2,
    updatedAt: "2026-10-28T12:00:00.000Z",
    edits: {},
    order: null,
    orderRequest: null,
    saveRequest: null,
    copyRequest: { id: copyId },
  };
  const raw = JSON.stringify(original),
    key = coachEditorDraftKey({ ...scope, id });
  x.data.set(key, raw);
  await x.controller.init();
  expect(x.controller.getSnapshot().blocked?.entry.kind).toBe("legacy");
  x.legacy.mockResolvedValueOnce({
    ok: true,
    version: 1,
    id: crypto.randomUUID(),
    sessionId: scope.sessionId,
    operation: "copy",
    copyId,
  });
  await x.controller.reconcileLegacy("copy");
  expect(x.data.get(key)).toBe(raw);
  expect(x.legacy.mock.calls[0][0].raw).toBe(raw);
});
it("una copia anterior confirmada reintenta solo su recuperación local tras una cuota llena", async () => {
  const x = setup(),
    id = crypto.randomUUID(),
    copyId = crypto.randomUUID(),
    key = coachEditorDraftKey({ ...scope, id });
  x.data.set(
    key,
    JSON.stringify({
      version: 3,
      ...scope,
      id,
      revision: 2,
      updatedAt: "2026-10-28T12:00:00.000Z",
      edits: {},
      order: null,
      orderRequest: null,
      saveRequest: null,
      copyRequest: { id: copyId },
    }),
  );
  x.legacy.mockImplementationOnce(async () => {
    x.block(true);
    return {
      ok: true,
      version: 1,
      id: copyId,
      sessionId: scope.sessionId,
      operation: "copy",
      copyId,
    };
  });
  await x.controller.init();
  await x.controller.reconcileLegacy("copy");
  expect(x.legacy).toHaveBeenCalledTimes(1);
  x.block(false);
  await x.controller.retry();
  expect(x.legacy).toHaveBeenCalledTimes(1);
  expect(x.data.size).toBe(0);
  expect(x.controller.getSnapshot().draft.revision).toBe(3);
  expect(x.controller.getSnapshot().copiedSessionId).toBe(copyId);
});
it("relee la protección antes de reintentar un pendiente que cambió en otra pestaña", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  x.mutate.mockRejectedValueOnce(Error("offline"));
  await x.controller.save();
  const key = coachEditorDraftKey(x.controller.getSnapshot().draft),
    other = '{"version":99}';
  x.data.set(key, other);
  await x.controller.retry();
  expect(x.mutate).toHaveBeenCalledTimes(1);
  expect(x.data.get(key)).toBe(other);
  expect(x.controller.getSnapshot().storage).toBe("error");
});
it("resuelve el conflicto local copiando la propuesta sin tocar el otro borrador ni cambiar el intento", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  await x.controller.flush();
  const originalKey = coachEditorDraftKey(x.controller.getSnapshot().draft);
  const second = new CoachSessionEditorController(scope, source(), [], x.deps);
  await second.init(x.controller.getSnapshot().draft.id);
  x.controller.change((draft) => ({ ...draft, title: "Otra pestaña" }));
  await x.controller.flush();
  const other = x.data.get(originalKey);
  second.change((draft) => ({ ...draft, title: "Mi propuesta" }));
  await second.save();
  const pending = second.getSnapshot().draft.pending!;
  expect(second.getSnapshot().storageConflict).toBe(true);
  await second.fork();
  expect(x.mutate).not.toHaveBeenCalled();
  expect(second.getSnapshot().draft.pending).toEqual(pending);
  expect(x.data.get(originalKey)).toBe(other);
  await second.retry();
  expect(x.mutate.mock.calls[0][0].request).toEqual(pending);
  expect(x.data.get(originalKey)).toBe(other);
});
it("descartar tras un conflicto carga la versión actual antes de retirar la propuesta", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  x.mutate.mockResolvedValueOnce({ ok: false, reason: "conflict" });
  await x.controller.save();
  const current = source();
  current.revision = 10;
  current.exercises[0].prescribed.target.targetDurationSeconds = 120;
  x.review.mockResolvedValueOnce(current);
  expect(await x.controller.discard(true)).toBe(true);
  expect(x.controller.getSnapshot().source.revision).toBe(10);
  expect(x.controller.goals(x.controller.getSnapshot().source.exercises[0])).toMatchObject({
    target: { targetDurationSeconds: "120" },
  });
  expect(x.data.size).toBe(0);
});
it("si falla leer la versión actual, descartar no borra todavía la propuesta protegida", async () => {
  const x = setup();
  await x.controller.init();
  edit(x);
  await x.controller.flush();
  const before = [...x.data];
  x.review.mockRejectedValueOnce(Error("offline"));
  expect(await x.controller.discard(true)).toBe(false);
  expect([...x.data]).toEqual(before);
  expect(x.controller.getSnapshot().draft.edits[rowId]).toBeDefined();
});
