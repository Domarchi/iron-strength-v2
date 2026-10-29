// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { workoutCorrectionSnapshotFixture } from "@/test/fixtures/workout-correction";
const mock = vi.hoisted(() => ({
  transaction: vi.fn(async () => {}),
  queue: vi.fn(async () => []),
}));
vi.mock("./storage", () => ({ offlineTransaction: mock.transaction }));
vi.mock("./queue", () => ({ listQueuedWorkouts: mock.queue, notifyQueueChanged: vi.fn() }));
import { clearLocalAccount, inspectLocalAccount } from "./local-account";
const user = workoutCorrectionSnapshotFixture().userId,
  key = `is:workout-removal:v1:${user}`,
  other = key.replace(user, workoutCorrectionSnapshotFixture().workout.id);
const empty = JSON.stringify({ version: 1, userId: user, pending: null });
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, fn: () => void) => fn() },
  });
});
it("una intención desconocida impide salida antes de tocar IndexedDB o quitar claves", async () => {
  localStorage.setItem(key, '{"version":99}');
  localStorage.setItem(other, "other-user");
  await expect(clearLocalAccount(user)).rejects.toThrow();
  expect(mock.transaction).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe('{"version":99}');
  expect(localStorage.getItem(other)).toBe("other-user");
});
it("solo tras borrado de cuenta confirmado retira desconocidos propios bajo el mismo bloqueo", async () => {
  localStorage.setItem(key, '{"version":99}');
  localStorage.setItem(other, "other-user");
  await clearLocalAccount(user, { afterAccountDeletion: true });
  expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(other)).toBe("other-user");
  expect(mock.transaction).toHaveBeenCalledTimes(2);
});
it("una modificación entre inspección y bloqueo se conserva, sin borrar otra ventana", async () => {
  localStorage.setItem(key, empty);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_key: string, fn: () => void) => {
        localStorage.setItem(key, '{"version":99}');
        fn();
      },
    },
  });
  await expect(clearLocalAccount(user)).rejects.toThrow();
  expect(localStorage.getItem(key)).toBe('{"version":99}');
});
it("sin bloqueo no retira ni da por limpiado el documento", async () => {
  localStorage.setItem(key, empty);
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  await expect(clearLocalAccount(user)).rejects.toThrow();
  expect(localStorage.getItem(key)).toBe(empty);
});
it("inspección diferencia sobres vacíos válidos de intentos/formatos futuros", async () => {
  localStorage.setItem(key, empty);
  expect(await inspectLocalAccount(user)).toEqual({ keys: 0, queued: 0, pending: false });
  localStorage.setItem(key, '{"version":99}');
  expect(await inspectLocalAccount(user)).toEqual({ keys: 1, queued: 0, pending: true });
});
