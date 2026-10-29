import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
import {
  assignedTrainingFixture,
  assignedId as id,
} from "../../../src/test/fixtures/assigned-training";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id: id(1), fullName: "Alumno", email: "student@example.test", role: "student" },
};
async function setup() {
  let raw: string | null = null;
  const fetcher = vi.fn<Transport>().mockResolvedValueOnce(Response.json(session));
  const client = new MobileClient(
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
  );
  await client.login(session.profile.email, "Synthetic-password");
  return { client, fetcher };
}
it("consulta objetivos4 con identidad, JWT y sin degradación a sessions1", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(Response.json(assignedTrainingFixture()));
  expect(await x.client.assignedRoutine(id(3).toUpperCase())).toEqual(assignedTrainingFixture());
  expect(x.fetcher.mock.calls[1][0]).toBe(
    "https://example.test/api/mobile/v1/training-sessions/" + id(3),
  );
  expect(x.fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  await expect(x.client.assignedRoutine("../other")).rejects.toMatchObject({ code: "not_found" });
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it("rechaza fuente futura o ajena y preserva errores sin fallback ciego", async () => {
  const x = await setup();
  for (const patch of [
    { userId: id(9) },
    { version: 6 },
    { session: { ...assignedTrainingFixture().session, id: id(9) } },
  ]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...assignedTrainingFixture(), ...patch }));
    await expect(x.client.assignedRoutine(id(3))).rejects.toBeInstanceOf(Error);
  }
  for (const status of [404, 409, 503]) {
    x.fetcher.mockResolvedValueOnce(
      Response.json(
        {
          version: 1,
          error: {
            code: status === 409 ? "not_current_week" : "unavailable",
            message: "Pendiente",
          },
        },
        { status },
      ),
    );
    await expect(x.client.assignedRoutine(id(3))).rejects.toMatchObject({ status });
  }
  expect(x.fetcher).toHaveBeenCalledTimes(7);
});
