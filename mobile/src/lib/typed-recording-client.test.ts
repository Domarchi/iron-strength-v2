import { expect, it, vi } from "vitest";
import { MobileClient, type CredentialStore, type Transport } from "./client";
import { typedRecordingFixture } from "../../../src/test/fixtures/typed-recording";
import { typedWorkoutSchema } from "../../../src/lib/mobile/typed-recording-contracts";
const userId = "11111111-1111-4111-8111-111111111111";
const session = {
  version: 1,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4000000000,
  profile: { id: userId, fullName: "Alumno", email: "student@example.test", role: "student" },
};
async function setup() {
  let raw: string | null = null;
  const store: CredentialStore = {
    get: async () => raw,
    set: async (v) => {
      raw = v;
    },
    remove: async () => {
      raw = null;
    },
  };
  const fetcher = vi.fn<Transport>().mockResolvedValueOnce(Response.json(session));
  const client = new MobileClient("https://example.test", store, fetcher);
  await client.login(session.profile.email, "Synthetic-password");
  return { client, fetcher };
}
function detail() {
  const p = typedRecordingFixture();
  const exercises = p.structure.exercises.map((r, position) => ({
    ...r,
    position,
    name: "Ejercicio",
    prescribedExerciseName: null,
    athleteNote: "Nota propia",
    sets: p.workout.sets
      .filter((s) => s.position === position)
      .map((s) => ({
        id: userId,
        setNumber: s.setNumber,
        metrics: s.metrics,
        setType: s.setType,
        effort: s.effort,
      })),
  }));
  return typedWorkoutSchema.parse({
    version: 3,
    workout: {
      id: p.id,
      sourceKind: "free",
      title: "Libre",
      personalRoutineId: null,
      personalRoutineRevision: null,
      programName: null,
      sessionLabel: null,
      startedAt: p.workout.startedAt,
      performedOn: "2026-10-26",
      durationSeconds: 600,
      perceivedEffort: null,
      note: null,
      structure: p.structure,
      exercises,
      summary: {
        workingSets: 1,
        volumeKg: 30,
        bodyweightReps: 0,
        exerciseCount: 1,
        recordedSeconds: 0,
        distanceMeters: 0,
      },
    },
  });
}
it("envía documento3 completo con Bearer y cuenta capturada, exige confirmación3 e identidad", async () => {
  const x = await setup(),
    p = typedRecordingFixture();
  const reply = { version: 3, ok: true, status: "created", workoutId: p.id };
  await expect(x.client.saveTypedRecording(p, p.id)).rejects.toMatchObject({ code: "identity" });
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  for (const [response, code] of [
    [{ ...reply, version: 2 }, "version"],
    [{ ...reply, workoutId: userId }, "identity"],
    [{ ...reply, version: 4 }, "version"],
  ] as const) {
    x.fetcher.mockResolvedValueOnce(Response.json(response));
    const revision = x.client.getDataRevision();
    await expect(x.client.saveTypedRecording(p, userId)).rejects.toMatchObject({ code });
    expect(x.client.getDataRevision()).toBe(revision);
  }
  x.fetcher.mockResolvedValueOnce(Response.json(reply));
  expect(await x.client.saveTypedRecording(p, userId)).toEqual(reply);
  const call = x.fetcher.mock.calls.at(-1)!;
  expect(call[0]).toBe("https://example.test/api/mobile/v1/typed-recordings");
  expect(call[1]).toMatchObject({
    method: "POST",
    credentials: "omit",
    headers: expect.objectContaining({ Authorization: "Bearer synthetic-access" }),
  });
  expect(JSON.parse(String(call[1].body))).toEqual({ version: 3, payload: p });
  expect(x.client.getDataRevision()).toBe(1);
});
it("valida el documento entero sin enviar cierres antiguos, tipos incompatibles o futuros", async () => {
  const x = await setup(),
    p = typedRecordingFixture();
  for (const value of [
    { ...p, version: 2 },
    { ...p, extra: true },
    {
      ...p,
      workout: {
        ...p.workout,
        sets: p.workout.sets.map((s) => ({ ...s, metrics: { ...s.metrics, durationSeconds: 60 } })),
      },
    },
  ])
    await expect(x.client.saveTypedRecording(value as typeof p, userId)).rejects.toMatchObject({
      code: "invalid_input",
    });
  expect(x.fetcher).toHaveBeenCalledTimes(1);
});
it("lectura3 devuelve todas las métricas/notas, valida ID y rechaza resultados de otra ruta o versión", async () => {
  const x = await setup(),
    d = detail();
  await expect(x.client.typedWorkout("../other")).rejects.toMatchObject({ code: "not_found" });
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  x.fetcher.mockResolvedValueOnce(Response.json(d));
  expect(await x.client.typedWorkout(d.workout.id.toUpperCase())).toEqual(d);
  expect(x.fetcher.mock.calls.at(-1)?.[0]).toBe(
    "https://example.test/api/mobile/v1/typed-recordings/" + d.workout.id,
  );
  x.fetcher.mockResolvedValueOnce(Response.json({ ...d, workout: { ...d.workout, id: userId } }));
  await expect(x.client.typedWorkout(d.workout.id)).rejects.toMatchObject({ code: "identity" });
  x.fetcher.mockResolvedValueOnce(Response.json({ ...d, version: 2 }));
  await expect(x.client.typedWorkout(d.workout.id)).rejects.toMatchObject({ code: "version" });
});
it("un404, rechazo o respuesta perdida conserva el documento y no lo reenvía a rutas antiguas", async () => {
  const x = await setup(),
    p = typedRecordingFixture(),
    before = structuredClone(p);
  x.fetcher.mockResolvedValueOnce(
    Response.json(
      { version: 1, error: { code: "not_found", message: "No disponible" } },
      { status: 404 },
    ),
  );
  await expect(x.client.typedWorkout(p.id)).rejects.toMatchObject({ status: 404 });
  x.fetcher.mockResolvedValueOnce(
    Response.json(
      { version: 1, error: { code: "conflict", message: "Revisa el envío" } },
      { status: 409 },
    ),
  );
  await expect(x.client.saveTypedRecording(p, userId)).rejects.toMatchObject({ status: 409 });
  x.fetcher.mockRejectedValueOnce(Error("lost"));
  await expect(x.client.saveTypedRecording(p, userId)).rejects.toMatchObject({ code: "network" });
  expect(p).toEqual(before);
  expect(x.client.getDataRevision()).toBe(0);
  expect(x.fetcher.mock.calls.slice(1).every((c) => c[0].includes("/typed-recordings"))).toBe(true);
});
it("resultado mixto prefiere3 y usa lectura anterior solo si la ruta tipada no está disponible", async () => {
  const x = await setup(),
    d = detail();
  x.fetcher.mockResolvedValueOnce(Response.json(d));
  expect(await x.client.workoutResult(d.workout.id)).toEqual(d);
  x.fetcher.mockResolvedValueOnce(
    Response.json(
      { version: 1, error: { code: "not_found", message: "Anterior" } },
      { status: 404 },
    ),
  );
  const old = {
    version: 1,
    workout: {
      ...d.workout,
      structure: undefined,
      exercises: d.workout.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          id: s.id,
          setNumber: s.setNumber,
          weightKg: s.metrics.weightKg,
          reps: s.metrics.reps,
          isWarmup: s.setType === "warmup",
        })),
      })),
    },
  };
  x.fetcher.mockResolvedValueOnce(Response.json(old));
  expect((await x.client.workoutResult(d.workout.id)).version).toBe(1);
  expect(x.fetcher.mock.calls.at(-1)?.[0]).toContain("/workouts/");
});
it("no degrada un resultado3 malformado ni intenta otras rutas ante una sesión rechazada", async () => {
  const x = await setup(),
    d = detail();
  x.fetcher.mockResolvedValueOnce(Response.json({ ...d, version: 4 }));
  await expect(x.client.workoutResult(d.workout.id)).rejects.toMatchObject({ code: "version" });
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
