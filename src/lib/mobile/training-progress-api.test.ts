import { expect, it, vi } from "vitest";
import { createTrainingProgressApi } from "./training-progress-api";
import { trainingProgressSchema } from "./training-progress-contracts";
import { isMobileEndpointPath } from "./paths";
const id = "a0000000-0000-4000-8000-000000000001";
const source = { version: 1, userId: id, today: "2026-10-28", workouts: [] };
const request = (query = "", token: string | null = "synthetic") =>
  new Request("https://app.test/api/mobile/v1/training-progress" + query, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
function setup() {
  const read = vi.fn().mockResolvedValue(source),
    authorize = vi.fn(async (token: string) =>
      token === "synthetic" ? { userId: id, read } : null,
    );
  return { read, authorize, api: createTrainingProgressApi({ authorize }) };
}
it("solo ruta exacta sin prefijos abiertos", () => {
  expect(isMobileEndpointPath("/api/mobile/v1/training-progress")).toBe(true);
  for (const path of [
    "/api/mobile/v1/training-progress/secret",
    "/api/mobile/v1/training-progress/export",
  ])
    expect(isMobileEndpointPath(path)).toBe(false);
});
it("exige bearer, no usa cookies ni consulta sin identidad", async () => {
  const x = setup();
  expect((await x.api.read(request("", null))).status).toBe(401);
  expect((await x.api.read(request("", "bad"))).status).toBe(401);
  expect(x.read).not.toHaveBeenCalled();
});
it("rechaza filtros/cuentas y duplicados, sin consultar los datos", async () => {
  const x = setup();
  for (const query of ["?userId=" + id, "?weeks=4", "?cursor=a&cursor=b", "?export=1"])
    expect((await x.api.read(request(query))).status).toBe(400);
  expect(x.read).not.toHaveBeenCalled();
});
it("devuelve snapshot derivado y cerrado2, privado, sin cookies", async () => {
  const x = setup(),
    r = await x.api.read(request());
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    version: 2,
    userId: id,
    today: "2026-10-28",
    activity: [],
    exercises: [],
  });
  expect(r.headers.get("Cache-Control")).toContain("no-store");
  expect(r.headers.get("Vary")).toContain("Authorization");
  expect(r.headers.get("Set-Cookie")).toBeNull();
});
it("identidad, versión futura y datos incompatibles nunca se degradan", async () => {
  const x = setup();
  for (const patch of [
    { userId: "b0000000-0000-4000-8000-000000000001" },
    { version: 2 },
    { workouts: [{ id }] },
    { future: 1 },
  ]) {
    x.read.mockResolvedValueOnce({ ...source, ...patch });
    expect((await x.api.read(request())).status).toBe(503);
  }
});
it("errores no revelan datos SQL ni producen vacío exitoso", async () => {
  const x = setup();
  x.read.mockRejectedValueOnce(Error("SQL user private"));
  const r = await x.api.read(request());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("SQL user private");
});
it("contrato de respuesta rechaza versiones, campos e identidades inválidas", () => {
  const response = { version: 2, userId: id, today: source.today, activity: [], exercises: [] };
  expect(trainingProgressSchema.safeParse(response).success).toBe(true);
  for (const patch of [{ version: 1 }, { secret: 1 }, { userId: "otro" }, { today: "2026-02-30" }])
    expect(trainingProgressSchema.safeParse({ ...response, ...patch }).success).toBe(false);
});
