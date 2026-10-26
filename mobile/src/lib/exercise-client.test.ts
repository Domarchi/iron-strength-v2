import { expect, it, vi } from "vitest";
import { MobileClient, type Transport } from "./client";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const exercise = {
  id,
  name: "Curl",
  muscleGroup: "Brazos",
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 1,
};
const detail = { version: 1, exercise, history: { items: [], nextCursor: null } };
it("catálogo y ficha usan bearer, validan cursor/ID y rechazan respuestas ajenas", async () => {
  const fetcher = vi
    .fn<Transport>()
    .mockResolvedValueOnce(
      Response.json({
        version: 1,
        accessToken: "access-a",
        refreshToken: "refresh-a",
        expiresAt: 2000000000,
        profile: { id, fullName: "Ana", email: "ana@example.test", role: "student" },
      }),
    )
    .mockResolvedValueOnce(Response.json({ version: 1, exercises: [exercise] }))
    .mockResolvedValueOnce(Response.json(detail))
    .mockResolvedValueOnce(Response.json({ ...detail, exercise: { ...exercise, id: other } }))
    .mockResolvedValueOnce(Response.json({ version: 2, exercises: [] }))
    .mockResolvedValueOnce(Response.json({ ...detail, version: 2 }));
  let raw: string | null = null;
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
    () => 1000000,
  );
  await client.login("ana@example.test", "clave");
  await expect(client.exerciseDetail("../../other")).rejects.toMatchObject({ code: "not_found" });
  await expect(client.exerciseDetail(id, "bad")).rejects.toMatchObject({ code: "invalid_input" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await client.exerciseCatalog()).exercises).toHaveLength(1);
  const cursor = "2026-10-23T15:00:00Z|" + other;
  expect((await client.exerciseDetail(id, cursor)).exercise.id).toBe(id);
  expect(fetcher.mock.calls[2][0]).toContain("?cursor=" + encodeURIComponent(cursor));
  expect(fetcher.mock.calls[2][1]).toMatchObject({
    method: "GET",
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer access-a" }),
  });
  await expect(client.exerciseDetail(id)).rejects.toMatchObject({ code: "identity" });
  await expect(client.exerciseCatalog()).rejects.toMatchObject({
    code: "version",
    message: expect.not.stringContaining("Zod"),
  });
  await expect(client.exerciseDetail(id)).rejects.toMatchObject({ code: "version" });
});
