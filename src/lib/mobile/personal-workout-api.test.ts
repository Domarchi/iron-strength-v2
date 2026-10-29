import { describe, expect, it, vi } from "vitest";
import { createPersonalWorkoutApi } from "./personal-workout-api";
const id = (n: number) => `af213000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = () => ({
  version: 1,
  id: id(1),
  origin: { kind: "free" },
  title: "Libre",
  startedAt: "2026-10-26T12:00:00Z",
  finishedAt: "2026-10-26T12:30:00Z",
  durationSeconds: 1800,
  sets: [{ exerciseId: id(2), position: 0, setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
});
const request = (
  value: unknown = { version: 1, payload: payload() },
  token: string | null = "valid",
  query = "",
) =>
  new Request("https://test.local/api/mobile/v1/personal-workouts" + query, {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
    body: JSON.stringify(value),
  });
function setup() {
  const save = vi.fn(async (): Promise<unknown> => ({ status: "created", workoutId: id(1) }));
  const authorize = vi.fn(async (token: string) => (token === "valid" ? { save } : null));
  return { save, authorize, api: createPersonalWorkoutApi({ authorize }) };
}
describe("API JWT de registro personal/libre", () => {
  it("requiere JWT y contrato cerrado sin destino arbitrario", async () => {
    const x = setup();
    expect((await x.api.save(request(undefined, null))).status).toBe(401);
    expect((await x.api.save(request(undefined, "invalid"))).status).toBe(401);
    expect((await x.api.save(request(undefined, "valid", "?studentId=" + id(8)))).status).toBe(400);
    expect(
      (await x.api.save(request({ version: 1, payload: { ...payload(), studentId: id(8) } })))
        .status,
    ).toBe(400);
    expect(x.save).not.toHaveBeenCalled();
  });
  it("confirma el ID enviado, privado y sin cookies; removed conserva el pendiente", async () => {
    const x = setup();
    const response = await x.api.save(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: 1,
      ok: true,
      status: "created",
      workoutId: id(1),
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(x.save).toHaveBeenCalledWith(payload());
    x.save.mockResolvedValueOnce({ status: "duplicate", workoutId: id(1) });
    expect((await (await x.api.save(request())).json()).status).toBe("duplicate");
    x.save.mockResolvedValueOnce({ status: "removed", workoutId: id(1) });
    expect((await x.api.save(request())).status).toBe(422);
    expect(
      (
        await x.api.save(
          request({ version: 1, payload: { ...payload(), note: "x".repeat(270000) } }),
        )
      ).status,
    ).toBe(413);
  });
  it("errores cerrados nunca exponen mensajes de SQL", async () => {
    const x = setup();
    for (const [code, status] of [
      ["23505", 409],
      ["22023", 400],
      ["P0002", 404],
      ["42501", 403],
      ["23514", 400],
      ["22P02", 400],
      ["XX000", 503],
    ] as const) {
      x.save.mockRejectedValueOnce({ code, message: "SQL privado" });
      const response = await x.api.save(request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("SQL privado");
    }
    x.save.mockResolvedValueOnce({ status: "created", workoutId: id(9) });
    expect((await x.api.save(request())).status).toBe(503);
    x.save.mockResolvedValueOnce({ status: "unknown" });
    expect((await x.api.save(request())).status).toBe(503);
  });
});
