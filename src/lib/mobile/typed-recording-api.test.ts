import { describe, expect, it, vi } from "vitest";
import { createTypedRecordingApi } from "./typed-recording-api";
import { typedRecordingFixture } from "../../test/fixtures/typed-recording";
function setup() {
  const payload = typedRecordingFixture(),
    save = vi.fn(async (): Promise<unknown> => ({ workoutId: payload.id, status: "created" })),
    read = vi.fn(async (): Promise<unknown> => null);
  const api = createTypedRecordingApi({
    authorize: async (token) => (token === "valid" ? { save, read } : null),
  });
  const request = (
    value: unknown = { version: 3, payload },
    token: string | null = "valid",
    query = "",
  ) =>
    new Request("https://example.test/api/mobile/v1/typed-recordings" + query, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(value),
    });
  return { api, payload, save, read, request };
}
describe("API de cierre3 y lectura completa", () => {
  it("requiere Bearer y documento3 cerrado, sin cookies ni caché", async () => {
    const x = setup();
    for (const token of [null, "bad"])
      expect((await x.api.save(x.request(undefined, token))).status).toBe(401);
    for (const value of [
      { version: 2, payload: x.payload },
      { version: 3, payload: x.payload, studentId: x.payload.id },
    ])
      expect((await x.api.save(x.request(value))).status).toBe(400);
    expect((await x.api.save(x.request(undefined, "valid", "?owner=other"))).status).toBe(400);
    const result = await x.api.save(x.request());
    expect(await result.json()).toEqual({
      version: 3,
      ok: true,
      workoutId: x.payload.id,
      status: "created",
    });
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("vary")).toContain("Authorization");
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("no confirma otro ID, un eliminado, contenido futuro ni una respuesta perdida", async () => {
    const x = setup();
    x.save.mockResolvedValueOnce({
      workoutId: x.payload.structure.exercises[0].id,
      status: "created",
    });
    expect((await x.api.save(x.request())).status).toBe(503);
    x.save.mockResolvedValueOnce({ workoutId: x.payload.id, status: "removed" });
    expect((await x.api.save(x.request())).status).toBe(422);
    x.save.mockRejectedValueOnce({ code: "40001", message: "private SQL" });
    const conflict = await x.api.save(x.request());
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain("private SQL");
    for (const [code, status] of [
      ["23505", 409],
      ["42501", 403],
      ["P0002", 404],
      ["23514", 400],
      ["unknown", 503],
    ] as const) {
      x.save.mockRejectedValueOnce({ code, message: "private SQL" });
      const response = await x.api.save(x.request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("private SQL");
    }
  });
  it("lectura valida ID/consulta y preserva404 y sesión; no devuelve datos de otra ruta", async () => {
    const x = setup();
    const read = (token: string | null = "valid", query = "") =>
      new Request("https://example.test/api/mobile/v1/typed-recordings/" + x.payload.id + query, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    expect((await x.api.read(read(null), x.payload.id)).status).toBe(401);
    expect((await x.api.read(read(), "invalid")).status).toBe(400);
    expect((await x.api.read(read("valid", "?user=other"), x.payload.id)).status).toBe(400);
    expect((await x.api.read(read(), x.payload.id)).status).toBe(404);
    x.read.mockResolvedValueOnce({ version: 4, workout: { id: x.payload.id } });
    expect((await x.api.read(read(), x.payload.id)).status).toBe(503);
  });
});
