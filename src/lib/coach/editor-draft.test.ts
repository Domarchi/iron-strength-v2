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

it("limpia el origen aunque el orden de propiedades cambie al leer campos nuevos", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  writer.persist({ ...draft, layoutRequest: null });
  const restored = listEditorDrafts(store, "coach", "program", "session")[0];
  writer.remove(restored, true);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([]);
});

it("conserva alternativas incompletas y la solicitud estable sin perder los otros borradores", () => {
  const store = storage(),
    writer = createEditorPersistence(() => store);
  const exerciseId = crypto.randomUUID(),
    exerciseRowId = crypto.randomUUID();
  const value: EditorDraft = {
    ...draft,
    edits: {},
    alternativeEdits: {
      [exerciseRowId]: [
        { exerciseId, sets: "", repsMin: "8", repsMax: "12", targetWeightKg: "22,5" },
      ],
    },
    alternativeRequest: {
      id: crypto.randomUUID(),
      revision: 2,
      exerciseRowId,
      alternatives: [{ exerciseId, sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 22.5 }],
    },
  };
  writer.persist(value);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([value]);
});
it("recupera el título pendiente y su solicitud junto a las prescripciones", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  const pending = {
    ...draft,
    title: "Tren superior",
    saveRequest: { id: "title-request", revision: 2, rows: [], title: "Tren superior" },
  };
  writer.persist(pending);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([pending]);
});
it("conserva la preparación de un lote y los campos explícitos tras recargar", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  const bulk = {
    ids: ["ex"],
    setsEnabled: true,
    repsEnabled: false,
    restEnabled: true,
    sets: "",
    repsMin: "8",
    repsMax: "12",
    restSeconds: "120",
  };
  const pending = {
    ...draft,
    bulk,
    edits: {
      ex: {
        ...draft.edits.ex,
        restSeconds: "120",
        fields: ["sets", "restSeconds"] as ("sets" | "restSeconds")[],
      },
    },
  };
  writer.persist(pending);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([pending]);
});

it("recupera el día pendiente y su solicitud sin perder títulos o prescripciones", () => {
  const store = storage();
  const writer = createEditorPersistence(() => store);
  const pending = {
    ...draft,
    weekday: 4,
    saveRequest: { id: "day-request", revision: 2, rows: [], weekday: 4 },
  };
  writer.persist(pending);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([pending]);
});

it("recupera agregado v2 y conserva formatos desconocidos o peticiones en un sobre antiguo", () => {
  const store = storage(),
    writer = createEditorPersistence(() => store);
  const request = {
    id: crypto.randomUUID(),
    revision: 2,
    items: [{ id: crypto.randomUUID(), exerciseId: crypto.randomUUID() }],
  };
  const next: EditorDraft = {
    ...draft,
    version: 2,
    additionSelection: request.items.map((i) => i.exerciseId),
    additionRequest: request,
  };
  expect(writer.persist(next)).toBe(true);
  expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([next]);
  const key = store.key(0)!;
  for (const version of [1, 99]) {
    const raw = JSON.stringify({ ...next, version });
    store.setItem(key, raw);
    expect(listEditorDrafts(store, "coach", "program", "session")).toEqual([]);
    expect(store.getItem(key)).toBe(raw);
  }
});
it("solo confirma escritura local después de releer exactamente el contenido", () => {
  const store = storage();
  const writer = createEditorPersistence(() => ({ ...store, setItem: () => {} }));
  expect(writer.persist({ ...draft, version: 2 })).toBe(false);
  expect(writer.getSnapshot()).toBe("error");
});
