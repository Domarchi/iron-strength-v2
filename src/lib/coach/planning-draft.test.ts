import { expect, it } from "vitest";
import {
  readPlanningDraft,
  writePlanningDraft,
  clearPlanningDraft,
  type PlanningDraft,
} from "./planning-draft";
function storage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
const draft: PlanningDraft = {
  version: 1,
  id: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  operation: "copy",
  updatedAt: "2026-10-21T10:00:00Z",
  input: { sourceWeek: 1, sourceSessions: [], targets: [{ week: 2, replace: true, sessions: [] }] },
};
it("aísla cuentas e intentos; limpiar uno confirmado conserva otras pestañas y desconocidos", () => {
  const store = storage();
  writePlanningDraft(store, draft);
  const second = { ...draft, id: crypto.randomUUID(), updatedAt: "2026-10-21T11:00:00Z" };
  writePlanningDraft(store, second);
  expect(readPlanningDraft(store, draft.userId, draft.programId, "copy", draft.id)).toEqual(draft);
  expect(readPlanningDraft(store, crypto.randomUUID(), draft.programId, "copy")).toBeNull();
  clearPlanningDraft(store, draft);
  expect(readPlanningDraft(store, draft.userId, draft.programId, "copy")).toEqual(second);
  const key = store.key(0)!;
  const unknown = JSON.stringify({ ...second, version: 99 });
  store.setItem(key, unknown);
  expect(readPlanningDraft(store, draft.userId, draft.programId, "copy")).toBeNull();
  expect(store.getItem(key)).toBe(unknown);
  expect(() => writePlanningDraft(store, second)).toThrow();
});
it("no cambia el contenido de una petición incierta ni afirma una escritura sin relectura", () => {
  const store = storage();
  writePlanningDraft(store, draft);
  expect(() =>
    writePlanningDraft(store, { ...draft, input: { ...draft.input, sourceWeek: 3 } }),
  ).toThrow();
  const changed = { ...draft, updatedAt: "2026-10-21T12:00:00Z" };
  writePlanningDraft(store, changed);
  clearPlanningDraft(store, draft);
  expect(readPlanningDraft(store, draft.userId, draft.programId, "copy")).toEqual(changed);
  expect(() => writePlanningDraft({ ...storage(), setItem: () => {} }, draft)).toThrow();
});
