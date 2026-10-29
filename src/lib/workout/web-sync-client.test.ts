import { it, expect, vi } from "vitest";
import { sendWebTraining } from "./web-sync-client";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { recordingFixture } from "@/test/fixtures/workout-recording";
import { queuedWorkoutPayloadSchema } from "../../../mobile/src/lib/queued-recording";
const owner = "00000000-0000-4000-8000-000000000001";
it("JSON estable sin IDs de acciones, con cookie del mismo origen, no-store y cuerpo original", async () => {
  const p = typedRecordingFixture(),
    f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ version: 3, ok: true, status: "created", workoutId: p.id }),
      );
  expect(await sendWebTraining(owner, p, f)).toMatchObject({
    version: 3,
    workoutId: p.id,
    status: "created",
  });
  expect(f).toHaveBeenCalledExactlyOnceWith(
    "/api/workouts/training-sync",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify({ version: 1, userId: owner, payload: p }),
    }),
  );
});
it("los cuatro contratos mantienen bytes e identidad al repetir, sin migrarlos", async () => {
  const assigned = recordingFixture("assigned"),
    personal = recordingFixture("personal");
  if (assigned.source !== "assigned" || personal.source === "assigned") throw Error("fixture");
  for (const value of [
    typedRecordingFixture(),
    assigned,
    assigned.workout,
    { ...personal.workout, version: 1 },
  ]) {
    const p = queuedWorkoutPayloadSchema.parse(value),
      version = p.version ?? 1,
      raw = JSON.stringify(p),
      f = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ version, ok: true, status: "duplicate", workoutId: p.id }),
        );
    await sendWebTraining(owner, p, f);
    await sendWebTraining(owner, p, f);
    expect(f.mock.calls.map((c) => c[1]?.body)).toEqual([
      JSON.stringify({ version: 1, userId: owner, payload: p }),
      JSON.stringify({ version: 1, userId: owner, payload: p }),
    ]);
    expect(JSON.stringify(p)).toBe(raw);
  }
});
it("sesión/cuenta/rechazo conservan causas seguras sin mostrar detalles del servidor", async () => {
  for (const [code, status] of [
    ["unauthorized", 401],
    ["account_changed", 403],
    ["removed", 422],
    ["conflict", 409],
  ] as const) {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { version: 1, error: { code, message: "private connection data" } },
          { status },
        ),
      );
    await expect(sendWebTraining(owner, typedRecordingFixture(), f)).rejects.toMatchObject({
      code,
      status,
    });
    await expect(sendWebTraining(owner, typedRecordingFixture(), f)).rejects.not.toThrow(
      "private connection",
    );
  }
});
it("corte, HTML, recibo ajeno o incompatible no confirman", async () => {
  const p = typedRecordingFixture();
  for (const factory of [
    () => Promise.reject(Error("private")),
    async () => new Response("<html>login</html>", { status: 200 }),
    async () => Response.json({ version: 3, ok: true, status: "created", workoutId: owner }),
    async () => Response.json({ version: 99, ok: true, status: "created", workoutId: p.id }),
  ])
    await expect(
      sendWebTraining(owner, p, vi.fn<typeof fetch>().mockImplementation(factory)),
    ).rejects.toMatchObject({ code: "unavailable", status: 503 });
});
it("formatos futuros o cuenta inválida no envían nada", async () => {
  const f = vi.fn<typeof fetch>();
  await expect(sendWebTraining("invalid", typedRecordingFixture(), f)).rejects.toMatchObject({
    code: "invalid_input",
  });
  await expect(
    sendWebTraining(owner, { ...typedRecordingFixture(), version: 99 } as never, f),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(f).not.toHaveBeenCalled();
});
