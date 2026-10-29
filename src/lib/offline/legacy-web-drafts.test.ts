import { expect, it } from "vitest";
import { readLegacyWebDrafts } from "./legacy-web-drafts";
import { createDraft } from "../workout/runner-state";
import { weekDownloadFixture } from "@/test/fixtures/week-download";
import type { DraftStorage } from "../workout/draft";
const pack = weekDownloadFixture(),
  owner = pack.userId;
function store(values: Record<string, string>): DraftStorage {
  const entries = Object.entries(values);
  return {
    length: entries.length,
    key: (i) => entries[i]?.[0] ?? null,
    getItem: (k) => values[k] ?? null,
    setItem() {
      throw Error("read only");
    },
    removeItem() {
      throw Error("read only");
    },
  };
}
it("lee formatos anteriores sin reescribir ni retirar el origen", () => {
  const draft = createDraft({
    plannedSession: pack.sessions[0].context.session,
    exercises: pack.sessions[0].context.exercises.map((e) => ({
      ...e,
      prescribed: {
        sets: e.prescribed.sets,
        repsMin: e.prescribed.repsMin,
        repsMax: e.prescribed.repsMax,
        targetWeightKg: e.prescribed.targetWeightKg,
      },
    })),
    userId: owner,
    workoutId: crypto.randomUUID(),
    now: new Date(),
  });
  for (const version of [1, 2, 3]) {
    const body = { ...draft, version: version === 3 ? 2 : 1 };
    const value = version === 1 ? body : { version, draft: body };
    const raw = JSON.stringify(value),
      key = `is:draft:v${version}:${owner}:${draft.plannedSessionId}`,
      s = store({ [key]: raw });
    expect(readLegacyWebDrafts(s, owner)[0].workoutId).toBe(draft.workoutId);
    expect(s.getItem(key)).toBe(raw);
  }
});
it("desconocido, corrupto o identidad incoherente no se presentan como lista vacía", () => {
  for (const [key, raw] of [
    [`is:draft:v99:${owner}:session`, "future"],
    [`is:draft:v3:${owner}:session`, "{}"],
    [`is:draft:v4:${owner}:training`, "future"],
  ])
    expect(() => readLegacyWebDrafts(store({ [key]: raw }), owner)).toThrow(/conserva/i);
});
it("no interpreta otras cuentas ni confunde la guarda tipada conocida con un borrador anterior", () => {
  const values = {
    [`is:draft:v99:other:session`]: "future",
    [`is:draft:v4:${owner}:training`]: JSON.stringify({
      version: 4,
      userId: owner,
      kind: "typed-training",
    }),
  };
  expect(readLegacyWebDrafts(store(values), owner)).toEqual([]);
});
it("propaga fallos de lectura antes de anunciar que no hay borradores", () => {
  const s = store({});
  Object.defineProperty(s, "length", {
    get() {
      throw Error("storage unavailable");
    },
  });
  expect(() => readLegacyWebDrafts(s, owner)).toThrow("storage unavailable");
});
