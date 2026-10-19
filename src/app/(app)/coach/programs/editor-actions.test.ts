import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCoach: vi.fn(),
  tree: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireCoach: mocks.requireCoach }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/data/programs", () => ({
  getProgramTree: mocks.tree,
  updateSessionExercise: mocks.update,
  addSessionExercise: mocks.add,
}));
import { savePrescriptionsAction, addExercisesAction } from "./editor-actions";
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

it("informa las filas realmente guardadas ante fallo parcial", async () => {
  mocks.update
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: false, reason: "week_locked" });
  const result = await savePrescriptionsAction(fd([row("a"), row("b")]));
  expect(result.savedIds).toEqual(["a"]);
  expect(result.error).toContain("bloqueada");
  expect(mocks.requireCoach).toHaveBeenCalled();
  expect(mocks.refresh).toHaveBeenCalled();
});
it("convierte fallos inesperados en un resultado reintentable sin perder los éxitos", async () => {
  mocks.update
    .mockResolvedValueOnce({ ok: true })
    .mockRejectedValueOnce(new Error("private database detail"));
  const result = await savePrescriptionsAction(fd([row("a"), row("b")]));
  expect(result.savedIds).toEqual(["a"]);
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain("private");
});
it("comprueba capacidad y no agrega una selección vacía", async () => {
  const data = fd([]);
  data.set("exerciseIds", JSON.stringify([]));
  expect((await addExercisesAction(data)).error).toBeTruthy();
  mocks.tree.mockResolvedValue({
    sessions: [{ id: "s", exercises: Array.from({ length: 15 }, () => ({ id: "x" })) }],
  });
  data.set("exerciseIds", JSON.stringify([exerciseId]));
  expect((await addExercisesAction(data)).error).toContain("15");
  expect(mocks.add).not.toHaveBeenCalled();
});
