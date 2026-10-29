import { expect, it } from "vitest";
import { trainingDownloadFixture } from "@/test/fixtures/training-download";
import { bundleSchema } from "./training-bundle";
import {
  downloadedAssignedContext,
  downloadedPersonalContext,
  downloadedFreeContext,
} from "./web-downloaded-training";
const b = bundleSchema.parse(trainingDownloadFixture()),
  user = b.userId;
it("asignada exige misma cuenta, sesión y semana; conserva objetivo y referencia", () => {
  const c = b.week!.sessions[0].context;
  expect(downloadedAssignedContext(b, user, c.session.id, "2026-10-29")).toEqual(c);
  for (const [owner, id, day] of [
    [user, c.session.id, "2026-11-02"],
    [user, crypto.randomUUID(), "2026-10-29"],
    [crypto.randomUUID(), c.session.id, "2026-10-29"],
  ])
    expect(() => downloadedAssignedContext(b, owner, id, day)).toThrow();
});
it("personal devuelve tipado3, mantiene null y exige revisión de la vista previa si cambió", () => {
  const r = b.library.routines[0];
  const c = downloadedPersonalContext(b, user, r);
  expect(c.version).toBe(3);
  expect(c.origin).toEqual({ kind: "personal", routineId: r.id, revision: r.revision });
  expect(c.exercises[0].prescribed).toEqual(r.items[0].prescribed);
  const changed = structuredClone(b);
  changed.library.routines[0].name = "Otro nombre";
  expect(() => downloadedPersonalContext(changed, user, r)).toThrow(/cambió/);
  const old = bundleSchema.parse(trainingDownloadFixture(null));
  expect(
    downloadedPersonalContext(old, old.userId, old.library.routines[0]).exercises[0].prescribed
      .recordType,
  ).toBeNull();
});
it("libre no inventa IDs de programa ni usa un catálogo ausente o de otra cuenta", () => {
  expect(downloadedFreeContext(b, user)).toMatchObject({
    version: 3,
    origin: { kind: "free" },
    sessionLabel: "Libre",
    exercises: [],
  });
  expect(() =>
    downloadedFreeContext({ ...b, catalog: { version: 2, exercises: [] } }, user),
  ).toThrow();
  expect(() => downloadedFreeContext(b, crypto.randomUUID())).toThrow();
});
it("crear contexto no cambia el paquete descargado, las prescripciones o sus IDs", () => {
  const before = JSON.stringify(b);
  downloadedPersonalContext(b, user, b.library.routines[0]);
  downloadedFreeContext(b, user);
  expect(JSON.stringify(b)).toBe(before);
});
