import { expect, it, vi } from "vitest";
import { createWebTrainingSync } from "./web-sync";
import { queuedWorkoutPayloadSchema } from "../../../mobile/src/lib/queued-recording";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { recordingFixture } from "@/test/fixtures/workout-recording";
import { assignedId as id } from "@/test/fixtures/assigned-training";
const owner = id(1);
function setup() {
  const save = vi.fn(async (p: { id: string }) => ({ workoutId: p.id, status: "created" }));
  const authorize = vi.fn(async () => ({ userId: owner, save }));
  return { save, authorize, post: createWebTrainingSync({ authorize }) };
}
function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("http://public.test/api/workouts/training-sync", {
    method: "POST",
    headers: {
      host: "public.test",
      origin: "http://public.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(value),
  });
}
const body = (payload: unknown = typedRecordingFixture()) => ({
  version: 1,
  userId: owner,
  payload,
});
it("acepta solo origen/cuenta/cuerpo verificados y confirma el mismo ID", async () => {
  const x = setup();
  const b = body();
  const r = await x.post(request(b));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    version: 3,
    ok: true,
    status: "created",
    workoutId: (b.payload as { id: string }).id,
  });
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("vary")).toBe("Cookie");
  expect(x.save).toHaveBeenCalledExactlyOnceWith(b.payload);
});
it("reintento conserva el cuerpo antiguo y confirma duplicate sin migrar el contrato", async () => {
  const x = setup(),
    old = queuedWorkoutPayloadSchema.parse(recordingFixture("assigned"));
  x.save.mockResolvedValue({ workoutId: old.id, status: "duplicate" });
  const raw = JSON.stringify(old);
  const r = await x.post(request(body(old)));
  expect(await r.json()).toMatchObject({ version: 2, status: "duplicate", workoutId: old.id });
  expect(JSON.stringify(x.save.mock.calls[0][0])).toBe(raw);
});
it("recupera el formato asignado sin version y el personal1 sin hacerlos pasar por3", async () => {
  const assigned = recordingFixture("assigned");
  if (assigned.source !== "assigned") throw Error("fixture");
  const free = recordingFixture("free");
  if (free.source === "assigned") throw Error("fixture");
  const personal = { ...free.workout, version: 1 };
  for (const p of [assigned.workout, personal]) {
    const x = setup();
    const r = await x.post(request(body(p)));
    expect(r.status).toBe(200);
    expect((await r.json()).version).toBe(1);
    expect(x.save.mock.calls[0][0]).toEqual(p);
  }
});
it("rechaza origen ajeno, cuenta cambiada, sesión ausente y query antes de escribir", async () => {
  const x = setup();
  expect((await x.post(request(body(), { origin: "https://foreign.test" }))).status).toBe(403);
  expect(x.authorize).not.toHaveBeenCalled();
  expect((await x.post(request({ ...body(), userId: id(20) }))).status).toBe(403);
  expect(x.save).not.toHaveBeenCalled();
  x.authorize.mockResolvedValue(null as never);
  expect((await x.post(request(body()))).status).toBe(401);
  expect(x.save).not.toHaveBeenCalled();
});
it("Host público con listener interno sigue siendo el origen de autoridad", async () => {
  const x = setup();
  const r = new Request("http://127.0.0.1:3100/api/workouts/training-sync", {
    method: "POST",
    headers: {
      host: "public.test",
      origin: "https://public.test",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
    },
    body: JSON.stringify(body()),
  });
  expect((await x.post(r)).status).toBe(200);
});
it("futuro/unknown/cuerpo grande o MIME incorrecto no se degradan a un contrato anterior", async () => {
  const x = setup();
  for (const b of [
    { ...body(), version: 99 },
    { ...body(), secret: "no" },
    body({ ...typedRecordingFixture(), version: 99 }),
  ])
    expect((await x.post(request(b))).status).toBe(400);
  expect((await x.post(request(body(), { "content-type": "text/plain" }))).status).toBe(400);
  expect((await x.post(request({ ...body(), padding: "x".repeat(262145) }))).status).toBe(413);
  expect(x.save).not.toHaveBeenCalled();
});
it("recibo ajeno/incompatible/eliminado no confirma ni resucita un entrenamiento", async () => {
  for (const receipt of [
    { workoutId: id(50), status: "created" },
    { status: "created" },
    { workoutId: typedRecordingFixture().id, status: "removed" },
  ]) {
    const x = setup();
    x.save.mockResolvedValue(receipt as never);
    const r = await x.post(request(body()));
    expect(r.status).not.toBe(200);
    expect((await r.json()).error).toEqual(
      expect.objectContaining({ message: expect.any(String) }),
    );
  }
});
it("fallo SQL no filtra detalles; conflicto y rechazo conservan una causa recuperable", async () => {
  for (const [code, status] of [
    ["40001", 409],
    ["42501", 403],
    ["P0002", 404],
    ["23514", 400],
    ["57014", 503],
  ] as const) {
    const x = setup();
    x.save.mockRejectedValue({ code, message: "private connection data" });
    const r = await x.post(request(body()));
    expect(r.status).toBe(status);
    expect(await r.text()).not.toContain("private connection");
  }
});
