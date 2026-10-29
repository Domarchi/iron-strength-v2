import { expect, it, vi } from "vitest";
import { createPersonalExerciseApi } from "./personal-exercise-api";
import { isMobileEndpointPath } from "./paths";
const id = "a0000000-0000-4000-8000-000000000001";
const input = {
  version: 1,
  requestId: id,
  targetId: id,
  expectedRevision: 0,
  operation: "create",
  data: {
    name: "Propio",
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: false,
    progressionIncrementKg: 2.5,
    recordType: "duration",
  },
};
const snapshot = { version: 1, userId: id, exercises: [] };
const confirmation = {
  version: 1,
  requestId: id,
  targetId: id,
  revision: 1,
  status: "created",
  duplicate: false,
};
const request = (body?: unknown, query = "", token: string | null = "synthetic") =>
  new Request("https://app.test/api/mobile/v1/personal-exercises" + query, {
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
function setup() {
  const read = vi.fn().mockResolvedValue(snapshot),
    mutate = vi.fn().mockResolvedValue(confirmation);
  const authorize = vi.fn(async (token: string) =>
    token === "synthetic" ? { userId: id, read, mutate } : null,
  );
  return { read, mutate, authorize, api: createPersonalExerciseApi({ authorize }) };
}
it("rutas exactas y autorización bearer activa, sin ampliar prefijos", async () => {
  const x = setup();
  for (const path of ["", "/mutations", "/export"])
    expect(isMobileEndpointPath("/api/mobile/v1/personal-exercises" + path)).toBe(true);
  expect(isMobileEndpointPath("/api/mobile/v1/personal-exercises/secret")).toBe(false);
  expect((await x.api.read(request(undefined, "", null))).status).toBe(401);
  expect((await x.api.mutate(request(input, "", "bad"))).status).toBe(401);
  expect(x.read).not.toHaveBeenCalled();
  expect(x.mutate).not.toHaveBeenCalled();
});
it("snapshot/exportación propios, cerrados y privados; identidad y versiones incompatibles fallan", async () => {
  const x = setup();
  for (const response of [await x.api.read(request()), await x.api.export(request())]) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  }
  for (const patch of [
    { userId: "b0000000-0000-4000-8000-000000000001" },
    { version: 2 },
    { receipts: [] },
  ]) {
    x.read.mockResolvedValueOnce({ ...snapshot, ...patch });
    expect((await x.api.read(request())).status).toBe(503);
  }
});
it("no acepta cuenta, parámetros, datos extra, cuerpo excesivo o JSON inválido", async () => {
  const x = setup();
  expect((await x.api.read(request(undefined, "?userId=" + id))).status).toBe(400);
  expect((await x.api.mutate(request({ ...input, ownerId: id }))).status).toBe(400);
  expect(
    (await x.api.mutate(request({ ...input, data: { ...input.data, name: "a".repeat(17000) } })))
      .status,
  ).toBe(413);
  const bad = new Request(request().url, {
    method: "POST",
    headers: { Authorization: "Bearer synthetic" },
    body: "{",
  });
  expect((await x.api.mutate(bad)).status).toBe(400);
  expect(x.mutate).not.toHaveBeenCalled();
});
it("confirma el intento exacto y traduce errores sin revelar SQL o datos privados", async () => {
  const x = setup();
  expect(await (await x.api.mutate(request(input))).json()).toEqual(confirmation);
  x.mutate.mockResolvedValueOnce({
    ...confirmation,
    targetId: "b0000000-0000-4000-8000-000000000001",
  });
  expect((await x.api.mutate(request(input))).status).toBe(503);
  for (const [code, status] of [
    ["40001", 409],
    ["23505", 409],
    ["22023", 400],
    ["23514", 400],
    ["42501", 403],
    ["P0002", 404],
    ["unknown", 503],
  ] as const) {
    x.mutate.mockRejectedValueOnce({ code, message: "SQL privado" });
    const response = await x.api.mutate(request(input));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("SQL privado");
  }
});
