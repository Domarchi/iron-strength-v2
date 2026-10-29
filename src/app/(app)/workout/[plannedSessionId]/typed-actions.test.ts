import { beforeEach, expect, it, vi } from "vitest";
import { assignedId as id, assignedTrainingFixture } from "@/test/fixtures/assigned-training";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/data/assigned-training-context", () => ({ getAssignedTrainingContext: mocks.read }));
vi.mock("@/lib/data/typed-recordings", () => ({ saveTypedWorkoutRecording: mocks.save }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { readAssignedTrainingAction, saveAssignedTrainingAction } from "./typed-actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: id(1) });
  mocks.db.mockResolvedValue("session-bound-client");
  mocks.read.mockResolvedValue({ ok: true, canStart: true, context: assignedTrainingFixture() });
  mocks.save.mockResolvedValue({
    status: "created",
    workoutId: typedRecordingFixture("assigned").id,
  });
});
it("consulta con cliente de sesión y sin parámetros cliente de recuperación", async () => {
  expect(
    await readAssignedTrainingAction({ version: 1, userId: id(1), sessionId: id(3) }),
  ).toMatchObject({ ok: true });
  expect(mocks.read.mock.calls).toEqual([["session-bound-client", id(1), id(3)]]);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("solo revalida después de una confirmación válida; errores y cambio de cuenta conservan intento", async () => {
  const payload = typedRecordingFixture("assigned"),
    request = { version: 1, userId: id(1), payload };
  mocks.user.mockResolvedValueOnce(null);
  expect(await saveAssignedTrainingAction(request)).toMatchObject({
    ok: false,
    code: "unauthorized",
  });
  mocks.user.mockResolvedValueOnce({ id: id(90) });
  expect(await saveAssignedTrainingAction(request)).toMatchObject({
    ok: false,
    code: "account_changed",
  });
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.save.mockRejectedValueOnce(Error("private"));
  expect(await saveAssignedTrainingAction(request)).toMatchObject({
    ok: false,
    code: "unavailable",
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(await saveAssignedTrainingAction(request)).toMatchObject({ ok: true });
  expect(mocks.save).toHaveBeenLastCalledWith("session-bound-client", payload);
  expect(mocks.revalidate.mock.calls).toEqual([
    ["/week"],
    ["/history"],
    ["/progress"],
    [`/history/${payload.id}`],
  ]);
});
