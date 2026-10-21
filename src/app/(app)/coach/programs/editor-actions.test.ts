import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCoach: vi.fn(),
  tree: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  refresh: vi.fn(),
  reorder: vi.fn(),
  duplicate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireCoach: mocks.requireCoach }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/data/programs", () => ({
  getProgramTree: mocks.tree,
  saveSessionPrescriptions: mocks.update,
  addSessionExercise: vi.fn(),
  reorderSessionExercises: mocks.reorder,
  duplicateRoutineItem: mocks.duplicate,
}));
vi.mock("@/lib/data/routine-additions", () => ({ addRoutineExercises: mocks.add }));
import {
  savePrescriptionsAction,
  addExercisesAction,
  reorderExercisesAction,
  duplicateRoutineAction,
} from "./editor-actions";
const exerciseId = "00000000-0000-4000-8000-000000000001";
const row = (id: string) => ({
  id,
  exerciseId,
  sets: "3",
  repsMin: "8",
  repsMax: "12",
  targetWeightKg: "",
  note: "",
});
const fd = (rows: unknown) => {
  const data = new FormData();
  data.set("programId", "p");
  data.set("sessionId", "s");
  data.set("requestId", "00000000-0000-4000-8000-000000000099");
  data.set("revision", "2");
  data.set("rows", JSON.stringify(rows));
  return data;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCoach.mockResolvedValue({ id: "coach" });
  mocks.tree.mockResolvedValue({
    sessions: [
      {
        id: "s",
        exercises: [
          { id: "a", exerciseId },
          { id: "b", exerciseId },
        ],
      },
    ],
  });
  mocks.update.mockResolvedValue({ ok: true });
  mocks.add.mockResolvedValue({ ok: true, id: "new" });
});
it("valida todo el lote antes de guardar y rechaza IDs ajenos", async () => {
  expect(
    (await savePrescriptionsAction(fd([row("a"), { ...row("b"), repsMax: "0" }]))).error,
  ).toBeTruthy();
  expect(mocks.update).not.toHaveBeenCalled();
  expect((await savePrescriptionsAction(fd([row("foreign")]))).error).toBeTruthy();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rechaza rangos invertidos en el servidor aunque se evite la validación del navegador", async () => {
  const result = await savePrescriptionsAction(fd([{ ...row("a"), repsMin: "15", repsMax: "12" }]));
  expect(result.error).toBeTruthy();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("un fallo del lote no confirma ninguna fila", async () => {
  mocks.update.mockResolvedValueOnce({ ok: false, reason: "week_locked" });
  const result = await savePrescriptionsAction(fd([row("a"), row("b")]));
  expect(result.savedIds).toEqual([]);
  expect(result.error).toContain("bloqueada");
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
it("una respuesta perdida mantiene el lote completo incierto", async () => {
  mocks.update.mockRejectedValueOnce(new Error("private database detail"));
  const result = await savePrescriptionsAction(fd([row("a"), row("b")]));
  expect(result.savedIds).toEqual([]);
  expect(result.uncertain).toBe(true);
  expect(result.error).not.toContain("private");
});
it("expone el conflicto sin confirmar ni sobrescribir filas", async () => {
  mocks.update.mockResolvedValueOnce({ ok: false, reason: "conflict" });
  expect(await savePrescriptionsAction(fd([row("a")]))).toMatchObject({
    savedIds: [],
    conflict: true,
  });
});
it("el agregado valida identidad y confirma todo el lote con una llamada", async () => {
  const data = fd([]);
  data.set("items", JSON.stringify([{ id: exerciseId, exerciseId }]));
  mocks.add.mockResolvedValueOnce({ ok: true, revision: 4 });
  expect(await addExercisesAction(data)).toEqual({
    error: null,
    savedIds: [exerciseId],
    revision: 4,
  });
  expect(mocks.add).toHaveBeenCalledTimes(1);
  data.delete("requestId");
  expect((await addExercisesAction(data)).savedIds).toEqual([]);
  expect(mocks.add).toHaveBeenCalledTimes(1);
});
it("un agregado incierto o rechazado nunca confirma una parte", async () => {
  const data = fd([]);
  data.set("items", JSON.stringify([{ id: exerciseId, exerciseId }]));
  mocks.add.mockResolvedValueOnce({ ok: false, reason: "conflict" });
  expect(await addExercisesAction(data)).toMatchObject({ savedIds: [], conflict: true });
  mocks.add.mockRejectedValueOnce(new Error("private"));
  const result = await addExercisesAction(data);
  expect(result).toMatchObject({ savedIds: [], uncertain: true });
  expect(result.error).not.toContain("private");
});

it("reordena únicamente una permutación completa de la sesión autenticada", async () => {
  const data = fd([]);
  data.set("orderedIds", JSON.stringify(["b", "a"]));
  mocks.reorder.mockResolvedValue({ ok: true });
  expect((await reorderExercisesAction(data)).error).toBeNull();
  expect(mocks.requireCoach).toHaveBeenCalled();
  expect(mocks.reorder).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "s", orderedIds: ["b", "a"] }),
  );
  mocks.reorder.mockClear();
  for (const ids of [["a"], ["a", "a"], ["foreign", "a"]]) {
    data.set("orderedIds", JSON.stringify(ids));
    expect((await reorderExercisesAction(data)).error).toBeTruthy();
  }
  expect(mocks.reorder).not.toHaveBeenCalled();
});
it("mantiene el bloqueo de semanas y permite reintentar un error de red al ordenar", async () => {
  const data = fd([]);
  data.set("orderedIds", JSON.stringify(["b", "a"]));
  mocks.reorder.mockResolvedValueOnce({ ok: false, reason: "week_locked" });
  expect((await reorderExercisesAction(data)).error).toContain("bloqueada");
  mocks.reorder.mockRejectedValueOnce(new Error("private"));
  const result = await reorderExercisesAction(data);
  expect(result.error).toContain("intentar");
  expect(result.error).not.toContain("private");
});

it("valida el origen y la identidad estable antes de duplicar", async () => {
  const data = fd([]);
  data.set("copyId", exerciseId);
  data.set("exerciseId", "foreign");
  expect((await duplicateRoutineAction(data)).error).toBeTruthy();
  expect(mocks.duplicate).not.toHaveBeenCalled();
  data.set("exerciseId", "a");
  mocks.duplicate.mockResolvedValue({ ok: true, id: exerciseId });
  expect((await duplicateRoutineAction(data)).savedIds).toEqual([exerciseId]);
  expect(mocks.requireCoach).toHaveBeenCalled();
  expect(mocks.duplicate).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "s", exerciseId: "a", copyId: exerciseId }),
  );
});

it("explica los límites de sesión y conserva el identificador para reintento", async () => {
  const data = fd([]);
  data.set("copyId", exerciseId);
  mocks.duplicate.mockResolvedValue({ ok: false, reason: "limit" });
  expect((await duplicateRoutineAction(data)).error).toContain("7 sesiones");
  mocks.duplicate.mockRejectedValue(new Error("private"));
  const result = await duplicateRoutineAction(data);
  expect(result.error).toContain("reintentar");
  expect(result.error).not.toContain("private");
});
