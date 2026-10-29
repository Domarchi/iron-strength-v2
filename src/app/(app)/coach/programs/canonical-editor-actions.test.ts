import { beforeEach, expect, it, vi } from "vitest";
import {
  mutateCanonicalSessionAction,
  reviewCanonicalSessionAction,
  reconcileLegacySessionAction,
} from "./canonical-editor-actions";
import type { EditorDraft } from "@/lib/coach/editor-draft";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  client: vi.fn(),
  mutate: vi.fn(),
  tree: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
  order: vi.fn(),
  copy: vi.fn(),
  layout: vi.fn(),
  alternatives: vi.fn(),
  add: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireCoach: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/data/coach-session", () => ({ mutateCoachSession: mocks.mutate }));
vi.mock("@/lib/data/coach-programs", () => ({ getCoachProgramTree: mocks.tree }));
vi.mock("@/lib/data/programs", () => ({
  saveSessionPrescriptions: mocks.save,
  reorderSessionExercises: mocks.order,
  duplicateRoutineItem: mocks.copy,
}));
vi.mock("@/lib/data/session-layout", () => ({ configureSessionLayout: mocks.layout }));
vi.mock("@/lib/data/routine-alternatives", () => ({ configureAlternatives: mocks.alternatives }));
vi.mock("@/lib/data/routine-additions", () => ({ addRoutineExercises: mocks.add }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
const scope = {
  userId: crypto.randomUUID(),
  programId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
};
const request = {
  version: 2 as const,
  id: crypto.randomUUID(),
  revision: 2,
  operation: "prescribe" as const,
  data: { rows: [], title: "Título" },
};
const db = {};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: scope.userId, role: "coach" });
  mocks.client.mockResolvedValue(db);
});
it("confirma un intento canónico aun si su origen ya no puede leerse", async () => {
  const result = {
    ok: true,
    result: {
      version: 2,
      id: request.id,
      sessionId: scope.sessionId,
      revision: 3,
      status: "removed",
    },
  };
  mocks.mutate.mockResolvedValue(result);
  mocks.tree.mockRejectedValue(Error("source removed"));
  expect(await mutateCanonicalSessionAction({ ...scope, request })).toEqual(result);
  expect(mocks.mutate).toHaveBeenCalledWith(db, scope.sessionId, request);
  expect(mocks.tree).not.toHaveBeenCalled();
});
it("no reutiliza una cuenta que cambió durante la edición ni acepta campos adicionales", async () => {
  expect(
    await mutateCanonicalSessionAction({ ...scope, userId: crypto.randomUUID(), request }),
  ).toEqual({ ok: false, reason: "forbidden" });
  expect(await mutateCanonicalSessionAction({ ...scope, request, extra: true })).toEqual({
    ok: false,
    reason: "invalid",
  });
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("conserva rechazo conocido e interpreta una excepción posterior como incierta", async () => {
  mocks.mutate
    .mockResolvedValueOnce({ ok: false, reason: "conflict" })
    .mockRejectedValueOnce(Error("offline"));
  expect(await mutateCanonicalSessionAction({ ...scope, request })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(await mutateCanonicalSessionAction({ ...scope, request })).toEqual({
    ok: false,
    reason: "uncertain",
  });
});
it("revisa solo el programa y sesión solicitados por su propietario autenticado", async () => {
  const session = { id: scope.sessionId, revision: 4 };
  mocks.tree.mockResolvedValue({ id: scope.programId, coachId: scope.userId, sessions: [session] });
  expect(await reviewCanonicalSessionAction(scope)).toEqual(session);
  expect(mocks.tree).toHaveBeenCalledWith(db, scope.programId);
  expect(await reviewCanonicalSessionAction({ ...scope, userId: crypto.randomUUID() })).toBeNull();
  mocks.tree.mockResolvedValue({ coachId: crypto.randomUUID(), sessions: [session] });
  expect(await reviewCanonicalSessionAction(scope)).toBeNull();
});
function old(over: Partial<EditorDraft> = {}): EditorDraft {
  return {
    version: 3,
    ...scope,
    id: crypto.randomUUID(),
    revision: 2,
    updatedAt: "2026-10-28T12:00:00.000Z",
    edits: {},
    order: null,
    orderRequest: null,
    saveRequest: null,
    copyRequest: null,
    ...over,
  };
}
it.each(["save", "order", "copy", "layout", "alternatives", "add"] as const)(
  "reconcilia %s con la identidad y función originales, sin leer el origen",
  async (operation) => {
    const identity = { id: crypto.randomUUID(), revision: 2 },
      rowId = crypto.randomUUID(),
      exerciseId = crypto.randomUUID();
    const variants = {
      save: old({ saveRequest: { ...identity, rows: [], title: "Mismo título", weekday: 1 } }),
      order: old({ orderRequest: identity, order: [rowId] }),
      copy: old({ copyRequest: { id: identity.id, exerciseId: rowId } }),
      layout: old({
        layoutRequest: {
          ...identity,
          layout: [{ id: rowId, restSeconds: 90, supersetId: null, supersetRestSeconds: null }],
        },
      }),
      alternatives: old({
        alternativeRequest: { ...identity, exerciseRowId: rowId, alternatives: [] },
      }),
      add: old({ additionRequest: { ...identity, items: [{ id: rowId, exerciseId }] } }),
    };
    mocks[operation].mockResolvedValue({ ok: true, revision: 4, id: identity.id });
    const raw = JSON.stringify(variants[operation]);
    expect(await reconcileLegacySessionAction({ ...scope, raw, operation })).toMatchObject({
      ok: true,
      version: 1,
      id: identity.id,
      sessionId: scope.sessionId,
      operation,
    });
    expect(mocks.tree).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    const args = mocks[operation].mock.calls[0];
    if (operation === "save")
      expect(args[0]).toMatchObject({
        sessionId: scope.sessionId,
        requestId: identity.id,
        expectedRevision: 2,
        rows: [],
        title: "Mismo título",
        weekday: 1,
      });
    if (operation === "copy")
      expect(args[0]).toMatchObject({
        sessionId: scope.sessionId,
        copyId: identity.id,
        exerciseId: rowId,
      });
    if (operation === "order")
      expect(args[0]).toMatchObject({
        sessionId: scope.sessionId,
        requestId: identity.id,
        expectedRevision: 2,
        orderedIds: [rowId],
      });
    if (operation === "add") expect(args[2]).toEqual(variants.add.additionRequest);
    if (operation === "layout") expect(args[2]).toEqual(variants.layout.layoutRequest);
    if (operation === "alternatives")
      expect(args[2]).toEqual(variants.alternatives.alternativeRequest);
    expect(raw).toBe(JSON.stringify(variants[operation]));
  },
);
it("no transforma un formato futuro, una cuenta ajena o una operación inexistente en petición nueva", async () => {
  for (const raw of [
    JSON.stringify({ ...old(), version: 99 }),
    JSON.stringify({ ...old(), userId: crypto.randomUUID() }),
    JSON.stringify(old()),
  ]) {
    expect(await reconcileLegacySessionAction({ ...scope, raw, operation: "copy" })).toEqual({
      ok: false,
      reason: "invalid",
    });
  }
  expect(mocks.client).not.toHaveBeenCalled();
});
