import { it, expect, vi } from "vitest";
import { dispatchWebRecording } from "./web-recording-dispatch";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { recordingFixture } from "@/test/fixtures/workout-recording";
import { queuedWorkoutPayloadSchema } from "../../../mobile/src/lib/queued-recording";
const a = recordingFixture("assigned"),
  f = recordingFixture("personal");
if (a.source !== "assigned" || f.source === "assigned") throw Error("fixture");
const payloads = [typedRecordingFixture(), a, a.workout, { ...f.workout, version: 1 }].map((v) =>
  queuedWorkoutPayloadSchema.parse(v),
);
function setup() {
  const saved = async (p: { id: string }) => ({ workoutId: p.id, status: "created" });
  return {
    typed: vi.fn(saved),
    recording: vi.fn(saved),
    personal: vi.fn(saved),
    legacy: vi.fn(async () => ({ ok: true, status: "created" }) as const),
    reconcile: vi.fn(async () => {}),
  };
}
it("elige las cuatro operaciones sin modificar el documento congelado", async () => {
  for (const [index, name] of ["typed", "recording", "legacy", "personal"].entries()) {
    const x = setup(),
      p = payloads[index],
      raw = JSON.stringify(p);
    await dispatchWebRecording(x, p);
    expect(x[name as keyof typeof x]).toHaveBeenCalledExactlyOnceWith(p);
    expect(JSON.stringify(p)).toBe(raw);
    for (const key of ["typed", "recording", "legacy", "personal"] as const)
      if (key !== name) expect(x[key]).not.toHaveBeenCalled();
  }
});
it("reconcilia duplicados anteriores y no convierte un removed en confirmación creada", async () => {
  const x = setup(),
    p = payloads[1];
  x.recording.mockResolvedValueOnce({ workoutId: p.id, status: "removed" });
  expect(await dispatchWebRecording(x, p)).toMatchObject({ status: "removed" });
  expect(x.reconcile).not.toHaveBeenCalled();
  x.recording.mockResolvedValueOnce({ workoutId: p.id, status: "duplicate" });
  await dispatchWebRecording(x, p);
  expect(x.reconcile).toHaveBeenCalledExactlyOnceWith(p.id);
});
it("rechazo legado conserva id_taken de su guard y no reconcilia", async () => {
  const x = setup();
  x.legacy.mockResolvedValue({ ok: false, reason: "id_taken" } as never);
  await expect(dispatchWebRecording(x, payloads[2])).rejects.toMatchObject({ code: "id_taken" });
  expect(x.reconcile).not.toHaveBeenCalled();
});
it("fallo de logro opcional no convierte un recibo confirmado en respuesta incierta", async () => {
  const x = setup();
  x.reconcile.mockRejectedValue(Error("optional"));
  expect(await dispatchWebRecording(x, payloads[3])).toMatchObject({ status: "created" });
});
it("recibo ajeno o incompatible no dispara logros", async () => {
  for (const receipt of [
    { workoutId: "00000000-0000-4000-8000-000000000099", status: "created" },
    { status: "created" },
  ]) {
    const x = setup();
    x.recording.mockResolvedValue(receipt as never);
    await expect(dispatchWebRecording(x, payloads[1])).rejects.toThrow();
    expect(x.reconcile).not.toHaveBeenCalled();
  }
});

import { createWebTrainingSync } from "./web-sync";
it("el transporte conserva cada rechazo legado como permanente y no lo reintenta como fallo de red", async () => {
  for (const [reason, status] of [
    ["invalid", 400],
    ["no_sets", 400],
    ["forbidden", 403],
    ["not_found", 404],
    ["wrong_week", 422],
    ["alternative_unavailable", 422],
    ["id_taken", 409],
  ] as const) {
    const ops = setup();
    ops.legacy.mockResolvedValue({ ok: false, reason } as never);
    const owner = "00000000-0000-4000-8000-000000000001";
    const post = createWebTrainingSync({
      authorize: async () => ({ userId: owner, save: (p) => dispatchWebRecording(ops, p) }),
    });
    const response = await post(
      new Request("https://app.test/api/workouts/training-sync", {
        method: "POST",
        headers: {
          host: "app.test",
          origin: "https://app.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ version: 1, userId: owner, payload: payloads[2] }),
      }),
    );
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(
      reason === "invalid" ? "invalid_input" : reason,
    );
    expect(ops.reconcile).not.toHaveBeenCalled();
  }
});
