import { expect, it } from "vitest";
import { readProgramCopy, saveProgramCopy, clearProgramCopy } from "./program-copy-draft";
it("dos pestañas conservan peticiones distintas; confirmar una no borra la otra", () => {
  const map = new Map<string, string>();
  const storage = {
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
  const first = {
    version: 1 as const,
    copyId: "10000000-0000-4000-8000-000000000001",
    name: "Primera",
    updatedAt: "2026-10-20T12:00:00Z",
  };
  const second = {
    ...first,
    copyId: "10000000-0000-4000-8000-000000000002",
    name: "Segunda",
    updatedAt: "2026-10-20T12:01:00Z",
  };
  saveProgramCopy(storage, "coach", "program", first);
  saveProgramCopy(storage, "coach", "program", second);
  expect(readProgramCopy(storage, "coach", "program", first.copyId)).toEqual(first);
  expect(readProgramCopy(storage, "coach", "program")).toEqual(second);
  expect(readProgramCopy(storage, "other", "program")).toBeNull();
  clearProgramCopy(storage, "coach", "program", second.copyId);
  expect(readProgramCopy(storage, "coach", "program")).toEqual(first);
});
