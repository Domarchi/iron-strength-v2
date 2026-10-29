import { expect, it, vi } from "vitest";
import { TrainingController } from "./training";
import { createTypedDraft, buildTypedRecording } from "./typed-training";
import {
  assignedTrainingFixture,
  assignedId as id,
} from "../../../src/test/fixtures/assigned-training";
import type { AtomicStorage } from "./atomic-contract";
function setup(date = "2026-10-27T12:00:00Z") {
  const data = new Map<string, string>();
  const storage: AtomicStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    compareAndSet: async (k, b, v) => {
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
    },
  };
  const send = vi.fn();
  const create = (userId = id(1)) =>
    new TrainingController(
      userId,
      storage,
      send,
      () => new Date(date),
      () => id(99),
    );
  return { data, create, send };
}
it("inicio asignado comprueba dueño/calendario y no escribe una fuente ajena o vencida", async () => {
  for (const [date, userId] of [
    ["2026-11-02T12:00:00Z", id(1)],
    ["2026-10-27T12:00:00Z", id(9)],
  ]) {
    const x = setup(date),
      c = x.create(userId);
    await c.restore();
    await expect(c.startTyped(assignedTrainingFixture())).rejects.toThrow();
    expect(x.data.size).toBe(0);
    expect(c.getSnapshot().active).toBeNull();
  }
});
it("recuperar después de cambiar la semana conserva el contexto, revisión y bytes exactos", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.startTyped(assignedTrainingFixture());
  const key = `is:native-training:v1:${id(1)}`,
    raw = x.data.get(key)!;
  const later = new TrainingController(
    id(1),
    { get: async () => raw, set: async () => {}, remove: async () => {} },
    x.send,
    () => new Date("2026-11-03T12:00:00Z"),
  );
  await later.restore();
  expect(later.getSnapshot().blocked).toBe(false);
  expect(later.getSnapshot().active).toEqual(c.getSnapshot().active);
  expect(JSON.parse(raw).active.routine.session.revision).toBe(7);
});
it("no permite crear o cerrar un borrador con identidad ajena al contexto4", () => {
  const context = assignedTrainingFixture();
  expect(() =>
    createTypedDraft({
      context,
      userId: id(9),
      workoutId: id(99),
      now: new Date("2026-10-27T12:00:00Z"),
    }),
  ).toThrow();
  const draft = createTypedDraft({
    context,
    userId: id(1),
    workoutId: id(99),
    now: new Date("2026-10-27T12:00:00Z"),
  });
  draft.exercises[0].sets[0] = { ...draft.exercises[0].sets[0], duration: "30", done: true };
  expect(
    buildTypedRecording(context, { ...draft, userId: id(9) }, new Date("2026-10-27T12:01:00Z")).ok,
  ).toBe(false);
});

it("contexto4 anterior se recupera sin añadir referencias ni cambiar sus bytes", async () => {
  const x = setup(),
    c = x.create();
  await c.restore();
  await c.startTyped(assignedTrainingFixture());
  const key = `is:native-training:v1:${id(1)}`,
    value = JSON.parse(x.data.get(key)!);
  delete value.active.routine.previousSets;
  value.active.routine.version = 4;
  const previous = JSON.stringify(value);
  x.data.set(key, previous);
  const recovered = x.create();
  await recovered.restore();
  expect(recovered.getSnapshot().blocked).toBe(false);
  expect(recovered.getSnapshot().active?.routine.version).toBe(4);
  expect(x.data.get(key)).toBe(previous);
});
