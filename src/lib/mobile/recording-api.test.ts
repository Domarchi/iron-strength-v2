import { describe, expect, it, vi } from "vitest";
import { createRecordingApi } from "./recording-api";
import { recordingFixture } from "../../test/fixtures/workout-recording";
const input = () => ({ version: 2, payload: recordingFixture() });
function request(value: unknown = input(), token: string | null = "valid", query = "") {
  return new Request("https://test.local/api/mobile/v1/recordings" + query, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(value),
  });
}
function setup() {
  const save = vi.fn(async (): Promise<unknown> => ({
    workoutId: recordingFixture().id,
    status: "created",
  }));
  const authorize = vi.fn(async (token: string) => (token === "valid" ? { save } : null));
  return { save, authorize, api: createRecordingApi({ authorize }) };
}
describe("API de cierre con estructura", () => {
  it("solo Bearer autenticado y documento versionado cerrado", async () => {
    const x = setup();
    for (const token of [null, "invalid"])
      expect((await x.api.save(request(undefined, token))).status).toBe(401);
    for (const value of [
      { ...input(), version: 1 },
      { ...input(), studentId: recordingFixture().id },
      { ...input(), payload: recordingFixture().workout },
    ])
      expect((await x.api.save(request(value))).status).toBe(400);
    expect((await x.api.save(request(undefined, "valid", "?studentId=other"))).status).toBe(400);
    expect(x.save).not.toHaveBeenCalled();
  });
  it("confirma la versión y el mismo ID, sin cookies o caché", async () => {
    const x = setup(),
      response = await x.api.save(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: 2,
      ok: true,
      workoutId: recordingFixture().id,
      status: "created",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Authorization");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(x.save).toHaveBeenCalledWith(recordingFixture());
    x.save.mockResolvedValueOnce({ workoutId: recordingFixture().id, status: "duplicate" });
    expect((await (await x.api.save(request())).json()).status).toBe("duplicate");
  });
  it("recibo ajeno, formato desconocido o eliminado nunca confirman", async () => {
    const x = setup();
    x.save.mockResolvedValueOnce({
      workoutId: recordingFixture().structure.exercises[0].id,
      status: "created",
    });
    expect((await x.api.save(request())).status).toBe(503);
    x.save.mockResolvedValueOnce({ workoutId: recordingFixture().id, status: "removed" });
    expect((await x.api.save(request())).status).toBe(422);
    x.save.mockResolvedValueOnce({ status: "unknown" });
    expect((await x.api.save(request())).status).toBe(503);
    expect((await x.api.save(request({ padding: "x".repeat(270000) }))).status).toBe(413);
  });
  it("conflicto de fuente, identidad, permisos y contenido conservan errores sin SQL privado", async () => {
    const x = setup();
    for (const [code, status] of [
      ["40001", 409],
      ["23505", 409],
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["P0001", 400],
      ["23514", 400],
      ["private_error", 503],
    ] as const) {
      x.save.mockRejectedValueOnce({ code, message: "private-sql-never-show" });
      const response = await x.api.save(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("private-sql-never-show");
    }
  });
});
