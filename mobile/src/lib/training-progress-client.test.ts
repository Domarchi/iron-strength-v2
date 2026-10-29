import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
const userId = "a0000000-0000-4000-8000-000000000001";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id: userId, fullName: "Alumno", email: "a@example.test", role: "student" },
};
const snapshot = { version: 2, userId, today: "2026-10-28", activity: [], exercises: [] };
async function setup() {
  let raw: string | null = null;
  const fetcher = vi.fn<Transport>().mockResolvedValueOnce(Response.json(session)),
    client = new MobileClient(
      "https://example.test",
      {
        get: async () => raw,
        set: async (value) => {
          raw = value;
        },
        remove: async () => {
          raw = null;
        },
      },
      fetcher,
    );
  await client.login(session.profile.email, "Synthetic-password");
  return { client, fetcher };
}
it("lectura cerrada2, Bearer y cuenta propia; nunca cae al progreso legado", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(Response.json(snapshot));
  expect(await x.client.trainingProgress()).toEqual(snapshot);
  expect(x.fetcher.mock.calls[1][0]).toBe("https://example.test/api/mobile/v1/training-progress");
  expect(x.fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  for (const patch of [{ version: 3 }, { future: 1 }]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...snapshot, ...patch }));
    await expect(x.client.trainingProgress()).rejects.toMatchObject({ code: "version" });
  }
  x.fetcher.mockResolvedValueOnce(
    Response.json({ ...snapshot, userId: "b0000000-0000-4000-8000-000000000001" }),
  );
  await expect(x.client.trainingProgress()).rejects.toMatchObject({ code: "identity" });
  x.fetcher.mockResolvedValueOnce(
    Response.json({ error: "not_found", message: "No disponible" }, { status: 404 }),
  );
  await expect(x.client.trainingProgress()).rejects.toMatchObject({ status: 404 });
  expect(
    x.fetcher.mock.calls.slice(1).every((c) => String(c[0]).endsWith("/training-progress")),
  ).toBe(true);
});
it("respuesta tardía no se entrega a otra sesión", async () => {
  const x = await setup();
  let release: (value: Response) => void = () => {};
  x.fetcher.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const promise = x.client.trainingProgress();
  await Promise.resolve();
  x.fetcher.mockResolvedValueOnce(Response.json({ version: 1, ok: true }));
  await x.client.logout();
  release(Response.json(snapshot));
  await expect(promise).rejects.toMatchObject({ code: "cancelled" });
});
