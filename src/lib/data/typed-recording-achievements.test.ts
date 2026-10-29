import { beforeEach, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
const mocks = vi.hoisted(() => ({ save: vi.fn(), achievements: vi.fn() }));
vi.mock("./typed-recordings", () => ({ saveTypedWorkoutRecording: mocks.save }));
vi.mock("./achievements", () => ({ syncAchievements: mocks.achievements }));
import { saveTypedWorkoutWithAchievements } from "./typed-recording-achievements";
const db = {} as SupabaseClient<Database>,
  owner = crypto.randomUUID(),
  payload = typedRecordingFixture();
beforeEach(() => {
  mocks.save.mockReset();
  mocks.achievements.mockReset();
  mocks.achievements.mockResolvedValue([]);
});
it("evalúa logros solo tras confirmar SQL y usa la identidad autenticada capturada", async () => {
  const receipt = { status: "created", workoutId: payload.id };
  mocks.save.mockResolvedValue(receipt);
  expect(await saveTypedWorkoutWithAchievements(db, owner, payload)).toBe(receipt);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(db, payload);
  expect(mocks.achievements).toHaveBeenCalledExactlyOnceWith({
    db,
    studentId: owner,
    workoutId: payload.id,
  });
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.achievements.mock.invocationCallOrder[0],
  );
});
it("un replay confirmado vuelve a reconciliar logros; un resultado eliminado no los otorga", async () => {
  mocks.save
    .mockResolvedValueOnce({ status: "duplicate", workoutId: payload.id })
    .mockResolvedValueOnce({ status: "removed", workoutId: payload.id });
  await saveTypedWorkoutWithAchievements(db, owner, payload);
  expect(mocks.achievements).toHaveBeenCalledTimes(1);
  await saveTypedWorkoutWithAchievements(db, owner, payload);
  expect(mocks.achievements).toHaveBeenCalledTimes(1);
});
it("rechazo de SQL no evalúa logros ni cambia el error", async () => {
  const error = new Error("rejected");
  mocks.save.mockRejectedValue(error);
  await expect(saveTypedWorkoutWithAchievements(db, owner, payload)).rejects.toBe(error);
  expect(mocks.achievements).not.toHaveBeenCalled();
});
it("un fallo del logro opcional no convierte un entrenamiento confirmado en cierre incierto", async () => {
  const receipt = { status: "created", workoutId: payload.id };
  mocks.save.mockResolvedValue(receipt);
  mocks.achievements.mockRejectedValue(new Error("unavailable"));
  expect(await saveTypedWorkoutWithAchievements(db, owner, payload)).toBe(receipt);
});
