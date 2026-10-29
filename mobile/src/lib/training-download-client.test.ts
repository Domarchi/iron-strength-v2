import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
import { trainingDownloadFixture } from "../../../src/test/fixtures/training-download";
const b = trainingDownloadFixture(),
  session = {
    version: 1,
    accessToken: "test-access",
    refreshToken: "test-refresh",
    expiresAt: 2000000000,
    profile: { id: b.userId, role: "student", fullName: "Alumno", email: "student@test.local" },
  };
function setup(fetcher: Transport) {
  let raw: string | null = null;
  return new MobileClient(
    "https://example.test",
    {
      get: async () => raw,
      set: async (v) => {
        raw = v;
      },
      remove: async () => {
        raw = null;
      },
    },
    fetcher,
    () => 1000000,
  );
}
function foreignBundle() {
  const value = structuredClone(b),
    owner = "00000000-0000-4000-8000-000000000002";
  value.userId = owner;
  value.library.userId = owner;
  value.week.sessions.forEach((row) => {
    row.context.userId = owner;
  });
  return value;
}
it("descarga completa con Bearer y sin cookies; rechaza cuenta/formato/fuente parcial", async () => {
  const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(b))
      .mockResolvedValueOnce(Response.json(foreignBundle()))
      .mockResolvedValueOnce(Response.json({ ...b, version: 99 }))
      .mockResolvedValueOnce(Response.json({ ...b, history: {} })),
    client = setup(fetcher);
  await client.login(session.profile.email, "clave");
  expect(await client.trainingDownload()).toEqual(b);
  expect(fetcher.mock.calls[1][0]).toBe("https://example.test/api/mobile/v1/training-download");
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    method: "GET",
    credentials: "omit",
    headers: { Authorization: "Bearer test-access" },
  });
  await expect(client.trainingDownload()).rejects.toMatchObject({ code: "identity" });
  await expect(client.trainingDownload()).rejects.toMatchObject({ code: "version" });
  await expect(client.trainingDownload()).rejects.toMatchObject({ code: "version" });
});
it("sin conexión no simula una descarga nueva ni consulta al servidor", async () => {
  const fetcher = vi.fn<Transport>().mockResolvedValueOnce(Response.json(session)),
    client = setup(fetcher);
  await client.login(session.profile.email, "clave");
  client.connectionLost();
  await expect(client.trainingDownload()).rejects.toMatchObject({ code: "offline" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
