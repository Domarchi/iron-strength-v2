import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
import {
  workoutRemovalFixture,
  workoutRemovalSnapshotFixture,
  removalUserId,
} from "../../../src/test/fixtures/workout-removal";
const input = workoutRemovalFixture(),
  snapshot = workoutRemovalSnapshotFixture();
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: {
    id: removalUserId,
    fullName: "Alumno",
    email: "student@example.test",
    role: "student",
  },
};
const receipt = {
  version: 1,
  requestId: input.requestId,
  workoutId: input.workoutId,
  revision: 6,
  status: "deleted",
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
it("lee instantánea propia cerrada por UUID normalizado y Bearer, sin cookies ni datos ajenos", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(Response.json(snapshot));
  expect(await x.client.workoutRemoval(input.workoutId.toUpperCase())).toEqual(snapshot);
  expect(x.fetcher.mock.calls[1][0]).toBe(
    "https://example.test/api/mobile/v1/workout-removals/" + input.workoutId,
  );
  expect(x.fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  for (const patch of [{ version: 2 }, { future: 1 }]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...snapshot, ...patch }));
    await expect(x.client.workoutRemoval(input.workoutId)).rejects.toMatchObject({
      code: "version",
    });
  }
  for (const value of [
    { ...snapshot, userId: input.workoutId },
    { ...snapshot, workout: { ...snapshot.workout, id: removalUserId } },
  ]) {
    x.fetcher.mockResolvedValueOnce(Response.json(value));
    await expect(x.client.workoutRemoval(input.workoutId)).rejects.toMatchObject({
      code: "identity",
    });
  }
  const calls = x.fetcher.mock.calls.length;
  await expect(x.client.workoutRemoval("https://other.test")).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(x.client.workoutRemoval(input.workoutId, input.workoutId)).rejects.toMatchObject({
    code: "identity",
  });
  expect(x.fetcher.mock.calls).toHaveLength(calls);
});
it("envía solo documento1 a la ruta propia e invalida después de una confirmación válida", async () => {
  const x = await setup();
  for (const [i, status] of ["deleted", "duplicate"].entries()) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...receipt, status }));
    expect(await x.client.removeWorkout(input, removalUserId)).toEqual({ ...receipt, status });
    expect(x.client.getDataRevision()).toBe(i + 1);
  }
  for (const call of x.fetcher.mock.calls.slice(1)) {
    expect(call[0]).toBe("https://example.test/api/mobile/v1/workout-removals");
    expect(call[1]).toMatchObject({
      method: "POST",
      credentials: "omit",
      body: JSON.stringify(input),
    });
  }
});
it("otra cuenta y documento inválido no producen peticiones", async () => {
  const x = await setup();
  await expect(x.client.removeWorkout(input, input.workoutId)).rejects.toMatchObject({
    code: "identity",
  });
  await expect(
    x.client.removeWorkout({ ...input, expectedRevision: -1 }, removalUserId),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(x.fetcher.mock.calls).toHaveLength(1);
  expect(x.client.getDataRevision()).toBe(0);
});
it("confirmaciones incompatibles o de otro intento/revisión no invalidan ni anuncian guardado", async () => {
  const x = await setup();
  for (const patch of [{ version: 2 }, { extra: 1 }]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...receipt, ...patch }));
    await expect(x.client.removeWorkout(input, removalUserId)).rejects.toMatchObject({
      code: "version",
    });
  }
  for (const patch of [
    { requestId: removalUserId },
    { workoutId: removalUserId },
    { revision: input.expectedRevision },
  ]) {
    x.fetcher.mockResolvedValueOnce(Response.json({ ...receipt, ...patch }));
    await expect(x.client.removeWorkout(input, removalUserId)).rejects.toMatchObject({
      code: "identity",
    });
  }
  expect(x.client.getDataRevision()).toBe(0);
});
it("404/503 y conflicto se conservan sin caer al cierre o editor anterior", async () => {
  const x = await setup();
  for (const [status, code] of [
    [404, "not_found"],
    [503, "unavailable"],
    [409, "conflict"],
    [409, "edit_locked"],
  ] as const) {
    x.fetcher.mockResolvedValueOnce(
      Response.json({ version: 1, error: { code, message: "Conserva tus cambios" } }, { status }),
    );
    await expect(x.client.removeWorkout(input, removalUserId)).rejects.toMatchObject({
      status,
      code,
    });
    x.fetcher.mockResolvedValueOnce(
      Response.json({ version: 1, error: { code, message: "Conserva tus cambios" } }, { status }),
    );
    await expect(x.client.workoutRemoval(input.workoutId)).rejects.toMatchObject({
      status,
      code,
    });
  }
  expect(
    x.fetcher.mock.calls.slice(1).every((c) => String(c[0]).includes("/workout-removals")),
  ).toBe(true);
  expect(x.client.getDataRevision()).toBe(0);
});
it("renovar una sesión repite el documento exacto y conserva IDs/revisión", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(
    Response.json(
      { version: 1, error: { code: "unauthorized", message: "Renueva" } },
      { status: 401 },
    ),
  );
  x.fetcher.mockResolvedValueOnce(Response.json({ ...session, accessToken: "synthetic-new" }));
  x.fetcher.mockResolvedValueOnce(Response.json(receipt));
  await x.client.removeWorkout(input, removalUserId);
  expect(x.fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify(input));
  expect(x.fetcher.mock.calls[3][1]?.body).toBe(x.fetcher.mock.calls[1][1]?.body);
  expect(x.fetcher.mock.calls[3][1]?.headers).toMatchObject({
    Authorization: "Bearer synthetic-new",
  });
  expect(x.client.getDataRevision()).toBe(1);
});
it("una respuesta tardía de lectura o escritura no pasa a la siguiente generación", async () => {
  for (const write of [false, true]) {
    const x = await setup();
    let release: (r: Response) => void = () => {};
    x.fetcher.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const pending = write
      ? x.client.removeWorkout(input, removalUserId)
      : x.client.workoutRemoval(input.workoutId);
    await Promise.resolve();
    x.fetcher.mockResolvedValueOnce(Response.json({ version: 1, ok: true }));
    await x.client.logout();
    release(Response.json(write ? receipt : snapshot));
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(x.client.getDataRevision()).toBe(0);
  }
});
