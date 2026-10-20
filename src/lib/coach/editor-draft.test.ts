import { expect, it } from "vitest";
import { createEditorPersistence, listEditorDrafts, type EditorDraft } from "./editor-draft";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}
const draft: EditorDraft = {
  version: 1,
  id: "draft-a",
  userId: "coach",
  programId: "program",
  sessionId: "session",
  revision: 2,
  updatedAt: "2026-10-20T10:00:00.000Z",
  edits: {
    ex: {
      id: "ex",
      exerciseId: "catalog",
      sets: "",
      repsMin: "8",
      repsMax: "12",
      targetWeightKg: "62,5",
      note: "Pausa",
    },
  },
  order: null,
  orderRequest: null,
  saveRequest: null,
  copyRequest: null,
};
it("conserva texto incompleto, revisión e identidad de petición tras una recarga", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  const pending = {
    ...draft,
    saveRequest: { id: "request", revision: 2, rows: Object.values(draft.edits) },
  };
  expect(writer.persist(pending)).toBe(true);
  expect(writer.getSnapshot()).toBe("saved");
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([pending]);
  expect(listEditorDrafts(store, "other", "program", "session")).toEqual([]);
});
it("dos pestañas conservan borradores independientes y guardar una no borra la otra", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  writer.persist(draft);
  writer.persist({ ...draft, id: "draft-b", updatedAt: "2026-10-20T11:00:00.000Z" });
  expect(listEditorDrafts(store, "coach", "program", "session").map((d) => d.id)).toEqual([
    "draft-b",
    "draft-a",
  ]);
  writer.remove(draft);
  expect(listEditorDrafts(store, "coach", "program", "session")).toHaveLength(1);
});
it("no afirma persistencia si la cuota falla, y permite reintentar", () => {
  const store = storage();
  let blocked = true;
  const writer = createEditorPersistence(() => ({
    ...store,
    setItem(k, v) {
      if (blocked) throw new Error("quota");
      store.setItem(k, v);
    },
  }));
  expect(writer.persist(draft)).toBe(false);
  expect(writer.getSnapshot()).toBe("error");
  blocked = false;
  expect(writer.persist(draft)).toBe(true);
  expect(writer.getSnapshot()).toBe("saved");
});
it("ignora datos corruptos y claves cuyo contenido pertenece a otra cuenta", () => {
  const store = storage();
  createEditorPersistence(() => store).persist(draft);
  const key = store.key(0)!;
  store.setItem(key, JSON.stringify({ ...draft, userId: "other" }));
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([]);
  store.setItem(key, "broken");
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([]);
});

it("limpiar un origen recuperado nunca elimina una edición posterior de otra pestaña", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  writer.persist(draft);
  const newer = {
    ...draft,
    updatedAt: "2026-10-20T12:00:00.000Z",
    edits: { ex: { ...draft.edits.ex, sets: "7" } },
  };
  writer.persist(newer);
  writer.remove(draft, true);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([newer]);
});
