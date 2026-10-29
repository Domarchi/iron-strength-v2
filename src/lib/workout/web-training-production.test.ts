import { beforeEach, expect, it, vi } from "vitest";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  client: vi.fn(),
  save: vi.fn(),
  download: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("../supabase/server", () => ({ createClient: mocks.client }));
vi.mock("../data/typed-recording-achievements", () => ({
  saveTypedWorkoutWithAchievements: mocks.save,
}));
vi.mock("../data/training-download", async (original) => ({
  ...(await original<object>()),
  readTrainingDownload: mocks.download,
}));
import { webTrainingSync, webTrainingDownload } from "./web-training-production";
const owner = "00000000-0000-4000-8000-000000000001";
const db = { authenticated: true };
const payload = typedRecordingFixture();
function request(userId = owner) {
  return new Request("https://app.test/api/workouts/training-sync", {
    method: "POST",
    headers: { host: "app.test", origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify({ version: 1, userId, payload }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: owner });
  mocks.client.mockResolvedValue(db);
  mocks.save.mockResolvedValue({ workoutId: payload.id, status: "created" });
});
it("guarda con la identidad verificada y el cliente de sesión, y después invalida vistas", async () => {
  const r = await webTrainingSync()(request());
  expect(r.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(db, owner, payload);
  expect(mocks.revalidate.mock.calls).toEqual([["/week"], ["/history"], ["/progress"]]);
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.revalidate.mock.invocationCallOrder[0],
  );
});
it("un fallo de caché posterior al commit no borra el recibo JSON confirmado", async () => {
  mocks.revalidate.mockImplementation(() => {
    throw Error("cache unavailable");
  });
  const r = await webTrainingSync()(request());
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ workoutId: payload.id, ok: true, status: "created" });
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("cuenta cambiada, sesión ausente y fallo SQL no invalidan vistas ni confirman", async () => {
  expect((await webTrainingSync()(request("00000000-0000-4000-8000-000000000002"))).status).toBe(
    403,
  );
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce(null);
  expect((await webTrainingSync()(request())).status).toBe(401);
  mocks.save.mockRejectedValueOnce({ code: "40001" });
  expect((await webTrainingSync()(request())).status).toBe(409);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("descarga no consulta datos cuando la cuenta capturada ya no es la autenticada", async () => {
  const r = await webTrainingDownload()(
    new Request("https://app.test/api/training/download", {
      headers: { "x-iron-strength-account": "00000000-0000-4000-8000-000000000002" },
    }),
  );
  expect(r.status).toBe(403);
  expect(mocks.download).not.toHaveBeenCalled();
});
