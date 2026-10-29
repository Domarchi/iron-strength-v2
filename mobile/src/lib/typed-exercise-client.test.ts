import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const exercise = {
  id,
  name: "Plancha",
  muscleGroup: "Core",
  equipment: null,
  isBodyweight: true,
  progressionIncrementKg: 1,
  recordType: "duration",
};
const detail = { version: 2, exercise, history: { items: [], nextCursor: null } };
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id, fullName: "Alumno", email: "student@example.test", role: "student" },
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
it("catálogo2/ficha2 usan Bearer, preservan tipo y validan cursor/UUID e identidad", async () => {
  const x = await setup();
  x.fetcher.mockResolvedValueOnce(Response.json({ version: 2, exercises: [exercise] }));
  expect((await x.client.trainingCatalog()).exercises[0]).toEqual(exercise);
  x.fetcher.mockResolvedValueOnce(Response.json(detail));
  expect(await x.client.trainingExerciseDetail(id.toUpperCase())).toEqual(detail);
  expect(x.fetcher.mock.calls[1][0]).toBe("https://example.test/api/mobile/v1/training-catalog");
  expect(x.fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  await expect(x.client.trainingExerciseDetail("../other")).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(x.client.trainingExerciseDetail(id, "invalid")).rejects.toMatchObject({
    code: "invalid_input",
  });
  expect(x.fetcher).toHaveBeenCalledTimes(3);
  x.fetcher.mockResolvedValueOnce(
    Response.json({ ...detail, exercise: { ...exercise, id: other } }),
  );
  await expect(x.client.trainingExerciseDetail(id)).rejects.toMatchObject({ code: "identity" });
});
it("404/503 consulta contrato1 sin inferir tipos, y la ficha anterior conserva su versión y origen desconocido", async () => {
  const x = await setup(),
    oldExercise = {
      id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      isBodyweight: exercise.isBodyweight,
      progressionIncrementKg: exercise.progressionIncrementKg,
    };
  x.fetcher
    .mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "not_found", message: "Anterior" } },
        { status: 404 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ version: 1, exercises: [oldExercise] }));
  expect((await x.client.trainingCatalog()).exercises).toEqual([
    { ...oldExercise, recordType: null },
  ]);
  const old = { version: 1, exercise: oldExercise, history: { items: [], nextCursor: null } };
  x.fetcher
    .mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "unavailable", message: "Anterior" } },
        { status: 503 },
      ),
    )
    .mockResolvedValueOnce(Response.json(old));
  expect(await x.client.trainingExerciseDetail(id)).toEqual(old);
  expect(x.fetcher.mock.calls.at(-1)?.[0]).toContain("/exercises/");
});
it("versiones/tipos nuevos inválidos y metadata ausente nunca caen a una interpretación anterior", async () => {
  const x = await setup();
  for (const body of [
    { version: 3, exercises: [exercise] },
    { version: 2, exercises: [{ ...exercise, recordType: undefined }] },
    { version: 2, exercises: [{ ...exercise, recordType: "other" }] },
  ]) {
    x.fetcher.mockResolvedValueOnce(Response.json(body));
    await expect(x.client.trainingCatalog()).rejects.toMatchObject({ code: "version" });
  }
  x.fetcher.mockResolvedValueOnce(Response.json({ ...detail, version: 3 }));
  await expect(x.client.trainingExerciseDetail(id)).rejects.toMatchObject({ code: "version" });
  expect(x.fetcher).toHaveBeenCalledTimes(5);
});
it("error de red no solicita otra ruta ni finge un catálogo vacío", async () => {
  const x = await setup();
  x.fetcher.mockRejectedValueOnce(Error("offline"));
  await expect(x.client.trainingCatalog()).rejects.toMatchObject({ code: "network" });
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it("si cambia la cuenta durante el404 no consulta la biblioteca anterior con otra identidad", async () => {
  const x = await setup();
  let release!: (r: Response) => void;
  x.fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const pending = x.client.trainingCatalog();
  x.fetcher.mockResolvedValueOnce(Response.json({ version: 1, ok: true }));
  await x.client.logout(id);
  release(
    Response.json(
      { version: 1, error: { code: "not_found", message: "Anterior" } },
      { status: 404 },
    ),
  );
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  expect(x.fetcher.mock.calls.some((c) => c[0].endsWith("/exercises"))).toBe(false);
});
