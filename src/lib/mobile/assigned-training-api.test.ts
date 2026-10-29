import { expect, it, vi } from "vitest";
import { createAssignedTrainingApi } from "./assigned-training-api";
import { assignedTrainingFixture, assignedId as id } from "../../test/fixtures/assigned-training";
const request = (query = "", token: string | null = "valid") =>
  new Request("https://test.invalid/api/mobile/v1/training-sessions/" + id(3) + query, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
function setup() {
  const read = vi.fn(async (sessionId: string) => ({
    ok: true as const,
    canStart: true,
    context: {
      ...assignedTrainingFixture(),
      session: { ...assignedTrainingFixture().session, id: sessionId },
    },
  }));
  const authorize = vi.fn(async (token: string) =>
    token === "valid" ? { userId: id(1), read } : null,
  );
  return { read, authorize, api: createAssignedTrainingApi({ authorize }) };
}
it("exige JWT, ID y consulta cerrada; responde sin cookies/caché", async () => {
  const x = setup();
  for (const token of [null, "bad"])
    expect((await x.api.read(request("", token), id(3))).status).toBe(401);
  expect((await x.api.read(request(), "bad")).status).toBe(404);
  for (const query of ["?userId=" + id(9), "?allowRecovery=true", "?cursor=x"])
    expect((await x.api.read(request(query), id(3))).status).toBe(400);
  expect(x.read).not.toHaveBeenCalled();
  const r = await x.api.read(request(), id(3).toUpperCase());
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual(assignedTrainingFixture());
  expect(x.read).toHaveBeenCalledWith(id(3));
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("vary")).toContain("Authorization");
  expect(r.headers.get("set-cookie")).toBeNull();
});
it("no expone otra cuenta/sesión, ausencia, otra semana o errores privados", async () => {
  const x = setup();
  for (const patch of [
    { userId: id(9) },
    { origin: { ...assignedTrainingFixture().origin, programSessionId: id(9) } },
    { version: 6 },
  ]) {
    x.read.mockResolvedValueOnce({
      ok: true,
      canStart: true,
      context: { ...assignedTrainingFixture(), ...patch },
    } as never);
    expect((await x.api.read(request(), id(3))).status).toBe(503);
  }
  x.read.mockResolvedValueOnce({ ok: false, reason: "not_found" } as never);
  expect((await x.api.read(request(), id(3))).status).toBe(404);
  x.read.mockResolvedValueOnce({ ok: false, reason: "not_current_week" } as never);
  expect((await x.api.read(request(), id(3))).status).toBe(409);
  x.read.mockRejectedValueOnce(Error("privateSQL"));
  const r = await x.api.read(request(), id(3));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("privateSQL");
});
