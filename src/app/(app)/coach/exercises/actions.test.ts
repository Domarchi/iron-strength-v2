import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  coach: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireCoach: mocks.coach }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/data/exercises", () => ({
  createExercise: mocks.create,
  updateExercise: mocks.update,
  archiveExercise: vi.fn(),
  restoreExercise: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: vi.fn() }));
import { createExerciseAction, updateExerciseAction } from "./actions";
const coachId = crypto.randomUUID();
function form(recordType?: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "Plancha",
    muscleGroup: "Core",
    equipment: "Peso corporal",
    progressionIncrementKg: "2.5",
  }))
    data.set(key, value);
  if (recordType !== undefined) data.set("recordType", recordType);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.coach.mockResolvedValue({ id: coachId });
  mocks.create.mockResolvedValue({ ok: true });
  mocks.update.mockResolvedValue({ ok: true });
});
it("la acción conserva el tipo explícito y autentica al coach", async () => {
  await createExerciseAction({ error: null }, form("duration"));
  expect(mocks.coach).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      coachId,
      input: expect.objectContaining({ recordType: "duration" }),
    }),
  );
});
it("un formulario anterior sin tipo conserva la entrada null", async () => {
  await createExerciseAction({ error: null }, form());
  expect(mocks.create.mock.calls[0][0].input.recordType).toBeNull();
});
it("editar no permite introducir un cambio de tipo en el formulario", async () => {
  const result = await updateExerciseAction(crypto.randomUUID(), { error: null }, form("duration"));
  expect(result.error).not.toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("no acredita éxito al fallar el guardado y permite conservar el formulario", async () => {
  mocks.create.mockRejectedValueOnce(Error("connection lost"));
  const result = await createExerciseAction({ error: null }, form("duration"));
  expect(result.error).toContain("confirmar");
  expect(result.saved).not.toBe(true);
});
