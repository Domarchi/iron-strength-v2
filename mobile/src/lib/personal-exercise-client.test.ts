import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
import type { PersonalExerciseMutation } from "../../../src/lib/mobile/personal-exercise-contracts";
const id = "a0000000-0000-4000-8000-000000000001",
  other = "b0000000-0000-4000-8000-000000000001";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id, fullName: "Alumno", email: "student@example.test", role: "student" },
};
const snapshot = { version: 1, userId: id, exercises: [] };
const input: PersonalExerciseMutation = {
  version: 1,
  requestId: id,
  targetId: id,
  expectedRevision: 0,
  operation: "create",
  data: {
    name: "Propio",
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: true,
    progressionIncrementKg: 1,
    recordType: "duration",
  },
};
const confirmation = {
  version: 1,
  requestId: id,
  targetId: id,
  revision: 1,
  status: "created",
  duplicate: false,
};
async function setup() {
  let raw: string | null = null;
  const fetcher = vi.fn<Transport>().mockResolvedValueOnce(Response.json(session));
  const client = new MobileClient(
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
it("gestión/exportación usan rutas exactas privadas y validan propietario/versión", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(Response.json(snapshot));
  expect(await x.client.personalExercises()).toEqual(snapshot);
  x.fetcher.mockResolvedValueOnce(Response.json(snapshot));
  expect(await x.client.exportPersonalExercises()).toEqual(snapshot);
  expect(x.fetcher.mock.calls[1][0]).toBe("https://example.test/api/mobile/v1/personal-exercises");
  expect(x.fetcher.mock.calls[2][0]).toBe(
    "https://example.test/api/mobile/v1/personal-exercises/export",
  );
  expect(x.fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  x.fetcher.mockResolvedValueOnce(Response.json({ ...snapshot, userId: other }));
  await expect(x.client.personalExercises()).rejects.toMatchObject({ code: "identity" });
  x.fetcher.mockResolvedValueOnce(Response.json({ ...snapshot, version: 2 }));
  await expect(x.client.personalExercises()).rejects.toMatchObject({ code: "version" });
});
it("mutación confirma intento y recurso; cuenta ajena y formato inválido no envían", async () => {
  const x = await setup();
  await expect(x.client.mutatePersonalExercise(input, other)).rejects.toMatchObject({
    code: "identity",
  });
  await expect(
    x.client.mutatePersonalExercise({ ...input, data: {} } as PersonalExerciseMutation, id),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  x.fetcher.mockResolvedValueOnce(Response.json(confirmation));
  expect(await x.client.mutatePersonalExercise(input, id)).toEqual(confirmation);
  expect(x.client.getDataRevision()).toBe(1);
  expect(JSON.parse(x.fetcher.mock.calls[1][1].body as string)).toEqual(input);
  for (const patch of [{ targetId: other }, { requestId: other }]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...confirmation, ...patch }));
    await expect(x.client.mutatePersonalExercise(input, id)).rejects.toMatchObject({
      code: "identity",
    });
  }
  expect(x.client.getDataRevision()).toBe(1);
});
it("503/404 no degrada escrituras ni finge colección vacía", async () => {
  const x = await setup();
  for (const status of [404, 503]) {
    x.fetcher.mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "unavailable", message: "Pendiente" } },
        { status },
      ),
    );
    await expect(x.client.mutatePersonalExercise(input, id)).rejects.toMatchObject({ status });
  }
  expect(x.fetcher).toHaveBeenCalledTimes(3);
  expect(x.client.getDataRevision()).toBe(0);
});
it("respuesta tardía tras salir no confirma ni invalida vistas de otra cuenta", async () => {
  const x = await setup();
  let release!: (response: Response) => void;
  x.fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = x.client.mutatePersonalExercise(input, id);
  x.fetcher.mockResolvedValueOnce(Response.json({ version: 1, ok: true }));
  await x.client.logout(id);
  release(Response.json(confirmation));
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  expect(x.client.getDataRevision()).toBe(0);
});
