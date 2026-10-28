import { expect, it, vi } from "vitest";
import { createWorkoutCorrectionApi } from "./workout-correction-api";
import { isMobileEndpointPath } from "./paths";
import { accessDecision } from "../auth/route-access";
import {
  workoutCorrectionFixture,
  workoutCorrectionSnapshotFixture,
  correctionUserId,
} from "../../test/fixtures/workout-correction";
const base = workoutCorrectionSnapshotFixture(),
  input = workoutCorrectionFixture();
const receipt = {
  version: 1,
  requestId: input.requestId,
  workoutId: input.workoutId,
  revision: 6,
  status: "updated",
};
function request(body?: unknown, query = "", token: string | null = "synthetic") {
  return new Request(
    "https://app.test/api/mobile/v1/workout-corrections" +
      (body === undefined ? "/" + input.workoutId : "") +
      query,
    {
      method: body === undefined ? "GET" : "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}
function setup() {
  const read = vi.fn().mockResolvedValue(base),
    correct = vi.fn().mockResolvedValue(receipt);
  const authorize = vi.fn(async (token: string) =>
    token === "synthetic" ? { userId: correctionUserId, read, correct } : null,
  );
  return { read, correct, authorize, api: createWorkoutCorrectionApi({ authorize }) };
}
it("solo rutas exactas pasan a su guarda JWT; cookies no autorizan operaciones", async () => {
  const x = setup();
  for (const path of [
    "/api/mobile/v1/workout-corrections",
    "/api/mobile/v1/workout-corrections/" + input.workoutId,
  ]) {
    expect(isMobileEndpointPath(path)).toBe(true);
    expect(accessDecision(path, false)).toBe("allow");
  }
  for (const suffix of [
    "/anything",
    "/" + input.workoutId + "/extra",
    "/" + input.workoutId + "/",
    "/",
  ])
    expect(isMobileEndpointPath("/api/mobile/v1/workout-corrections" + suffix)).toBe(false);
  expect((await x.api.read(request(undefined, "", null), input.workoutId)).status).toBe(401);
  expect((await x.api.correct(request(input, "", "bad"))).status).toBe(401);
  const cookie = new Request(request(input, "", null), {
    headers: { Cookie: "session=synthetic" },
  });
  expect((await x.api.correct(cookie)).status).toBe(401);
  expect(x.read).not.toHaveBeenCalled();
  expect(x.correct).not.toHaveBeenCalled();
});
it("consulta la instantánea propia completa; 404 real, no-store y ningún dato ajeno", async () => {
  const x = setup(),
    response = await x.api.read(request(), input.workoutId.toUpperCase());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(base);
  expect(x.read).toHaveBeenCalledWith(input.workoutId);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(response.headers.get("set-cookie")).toBeNull();
  x.read.mockResolvedValueOnce(null);
  expect((await x.api.read(request(), input.workoutId)).status).toBe(404);
  for (const value of [
    { ...base, userId: input.workoutId },
    { ...base, version: 2 },
    { ...base, workout: { ...base.workout, id: correctionUserId } },
    { ...base, receipts: [] },
  ]) {
    x.read.mockResolvedValueOnce(value);
    expect((await x.api.read(request(), input.workoutId)).status).toBe(503);
  }
});
it("parámetros, UUID, campos extra, JSON inválido y cuerpos excesivos se rechazan sin escribir", async () => {
  const x = setup();
  expect(
    (await x.api.read(request(undefined, "?userId=" + correctionUserId), input.workoutId)).status,
  ).toBe(400);
  expect((await x.api.read(request(), "not-uuid")).status).toBe(400);
  expect((await x.api.correct(request(input, "?force=true"))).status).toBe(400);
  for (const patch of [
    { studentId: correctionUserId },
    { version: 2 },
    { sets: [] },
    { expectedRevision: -1 },
  ])
    expect((await x.api.correct(request({ ...input, ...patch }))).status).toBe(400);
  expect(
    (
      await x.api.correct(
        new Request(request(input).url, {
          method: "POST",
          headers: { Authorization: "Bearer synthetic" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect((await x.api.correct(request({ ...input, note: "x".repeat(262145) }))).status).toBe(413);
  expect(x.correct).not.toHaveBeenCalled();
});
it("actualizar, duplicado y eliminado son confirmaciones cerradas con revisión posterior", async () => {
  const x = setup();
  for (const status of ["updated", "duplicate", "removed"]) {
    x.correct.mockResolvedValueOnce({ ...receipt, status });
    const response = await x.api.correct(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...receipt, status });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(x.correct).toHaveBeenLastCalledWith(input);
  for (const patch of [
    { version: 2 },
    { requestId: correctionUserId },
    { workoutId: correctionUserId },
    { revision: input.expectedRevision },
    { status: "future" },
    { privateReceipt: "secret" },
  ]) {
    x.correct.mockResolvedValueOnce({ ...receipt, ...patch });
    expect((await x.api.correct(request(input))).status).toBe(503);
  }
});
it("errores de permisos, revisión, ventana y transitorios conservan su causa sin filtrar SQL", async () => {
  const x = setup();
  for (const [code, status, reason] of [
    ["40001", 409, "conflict"],
    ["55000", 409, "edit_locked"],
    ["P0002", 404, "not_found"],
    ["42501", 403, "forbidden"],
    ["22023", 400, "invalid_input"],
    ["23514", 400, "invalid_input"],
    ["40P01", 503, "unavailable"],
    ["unexpected", 503, "unavailable"],
  ] as const) {
    x.correct.mockRejectedValueOnce({ code, message: "internal_private_sql" });
    const response = await x.api.correct(request(input));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(reason);
    expect(JSON.stringify(body)).not.toContain("internal_private_sql");
  }
  x.authorize.mockRejectedValueOnce(Error("internal_private_sql"));
  expect((await x.api.read(request(), input.workoutId)).status).toBe(503);
});
