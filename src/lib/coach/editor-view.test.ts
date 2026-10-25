import { describe, expect, it } from "vitest";
import { readEditorView, saveEditorView, viewKey, clearEditorViews } from "./editor-view";
const scope = { userId: "coach-a", programId: "program-a" };
const weeks = [
  { number: 1, sessionIds: ["a", "b"] },
  { number: 3, sessionIds: ["c", "d"] },
];
function store(raw: string | null = null) {
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
}
describe("posición del editor sin prescripciones", () => {
  it("recupera semana/sesiones propias y sustituye sesiones eliminadas", () => {
    const storage = store();
    expect(saveEditorView(storage, scope, { week: 3, sessions: { 1: "b", 3: "d" } })).toBe(true);
    expect(readEditorView(storage, scope, weeks, 1)).toEqual({
      view: { week: 3, sessions: { 1: "b", 3: "d" } },
      writable: true,
    });
    expect(readEditorView(storage, scope, [{ number: 3, sessionIds: ["c"] }], 3).view).toEqual({
      week: 3,
      sessions: { 3: "c" },
    });
  });
  it("rechaza identidad/formato desconocidos sin sustituir su contenido", () => {
    for (const value of [
      { version: 99 },
      { version: 1, ...scope, userId: "other", week: 3, sessions: {} },
    ]) {
      const raw = JSON.stringify(value),
        storage = store(raw);
      expect(readEditorView(storage, scope, weeks, 1)).toMatchObject({
        view: { week: 1 },
        writable: false,
      });
      expect(saveEditorView(storage, scope, { week: 3, sessions: {} })).toBe(false);
      expect(storage.getItem()).toBe(raw);
    }
    expect(viewKey(scope)).not.toBe(viewKey({ ...scope, programId: "other" }));
    expect(viewKey(scope)).not.toBe(viewKey({ ...scope, userId: "other" }));
  });
  it("no afirma guardado con cuota/relectura fallida; permite vista inicial válida", () => {
    const full = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readEditorView(full, scope, weeks, 2)).toMatchObject({
      view: { week: 1 },
      writable: false,
    });
    expect(saveEditorView(full, scope, { week: 3, sessions: {} })).toBe(false);
    expect(
      saveEditorView({ getItem: () => null, setItem: () => {} }, scope, { week: 3, sessions: {} }),
    ).toBe(false);
  });
});

it("la salida limpia preferencias propias, no otras cuentas ni borradores", () => {
  const values = new Map([
    ["is:coach-view:v1:a:p", "{}"],
    ["is:coach-view:v99:a:q", "unknown"],
    ["is:coach-view:v1:ab:p", "{}"],
    ["is:coach-draft:v1:a:p:s:e", "draft"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
  } as Storage;
  clearEditorViews(storage, "a");
  expect([...values.keys()]).toEqual(["is:coach-view:v1:ab:p", "is:coach-draft:v1:a:p:s:e"]);
});
