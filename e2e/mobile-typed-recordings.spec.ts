import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import {
  typedRecordingPayloadSchema,
  typedRecordingSaveSchema,
  typedWorkoutSchema,
} from "../src/lib/mobile/typed-recording-contracts";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import {
  typedContextSchema,
  typedDraftSchema,
  createTypedDraft,
  completeTypedSet,
  editTypedSet,
  buildTypedRecording,
} from "../mobile/src/lib/typed-training";
const path = "/api/mobile/v1/typed-recordings",
  email = "typed-recording@iron-strength.e2e.test",
  other = "typed-other@iron-strength.e2e.test",
  password = "Typed-recording-local-only-2026!";
let exercises: string[];
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (const address of [email, other, "typed-third@iron-strength.e2e.test"])
    await createUser(admin(), {
      role: "student",
      name: "Alumno",
      email: address,
      password,
      coachId,
    });
  const result = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `Tipo HTTP ${i}`,
        muscle_group: "Pecho" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  if (result.error) throw result.error;
  exercises = trainingMetricCases.map(
    (_, i) => result.data.find((e) => e.name === `Tipo HTTP ${i}`)!.id,
  );
});
test.afterAll(async () => {
  await resetAll();
  if (exercises?.length) await admin().from("exercises").delete().in("id", exercises);
});
async function login(request: APIRequestContext, address = email) {
  const result = await request.post("/api/mobile/v1/auth/login", {
    data: { email: address, password: address === COACH.email ? COACH.password : password },
  });
  expect(result.status()).toBe(200);
  return { Authorization: `Bearer ${(await result.json()).accessToken}` };
}
function payload(index: number) {
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.workout.durationSeconds = 0;
  const m = trainingMetricCases[index];
  p.structure.exercises.forEach((r, i) => {
    r.id = randomUUID();
    r.exerciseId = exercises[i ? 0 : index];
    if (!i)
      r.prescribed = {
        recordType: m.recordType,
        sets: 2,
        target: {
          repsMin: m.reps === null ? null : 8,
          repsMax: m.reps === null ? null : 12,
          targetWeightKg: m.weightKg,
          targetDurationSeconds: m.durationSeconds,
          targetDistanceMeters: m.distanceMeters,
        },
        series: null,
      };
  });
  p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
    sessionExerciseId: r.id,
    note: i ? "Sin series, con nota" : "Propia",
  }));
  p.workout.sets = [
    {
      ...p.workout.sets[0],
      exerciseId: exercises[index],
      metrics: m,
      setType: "drop",
      effort: 8.5,
    },
  ];
  return typedRecordingPayloadSchema.parse(p);
}
test("JWT real, cierre completo de cada tipo, reintento y lectura sin cookies/caché", async ({
  request,
  page,
}) => {
  const headers = await login(request),
    otherHeaders = await login(request, other),
    coachHeaders = await login(request, COACH.email);
  await loginWeb(page, COACH.email, COACH.password);
  for (let i = 0; i < trainingMetricCases.length; i++) {
    const p = payload(i),
      data = { version: 3, payload: p };
    expect((await request.post(path, { data })).status()).toBe(401);
    expect((await page.request.post(path, { data })).status()).toBe(401);
    expect((await request.post("/api/mobile/v1/recordings", { headers, data })).status()).toBe(400);
    const results = await Promise.all([
      request.post(path, { headers, data }),
      request.post(path, { headers, data }),
    ]);
    const statuses = [];
    for (const response of results) {
      expect(response.status()).toBe(200);
      const body = typedRecordingSaveSchema.parse(await response.json());
      expect(body.workoutId).toBe(p.id);
      statuses.push(body.status);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["set-cookie"]).toBeUndefined();
    }
    expect(statuses.sort()).toEqual(["created", "duplicate"]);
    const detail = await request.get(path + "/" + p.id, { headers });
    expect(detail.status()).toBe(200);
    const saved = typedWorkoutSchema.parse(await detail.json());
    expect(saved.workout.structure).toEqual(p.structure);
    expect(saved.workout.exercises[0].sets[0]).toMatchObject({
      metrics: mPayload(p),
      setType: "drop",
      effort: 8.5,
    });
    expect(saved.workout.exercises[1]).toMatchObject({
      athleteNote: "Sin series, con nota",
      sets: [],
    });
    for (const actor of [otherHeaders, coachHeaders])
      expect((await request.get(path + "/" + p.id, { headers: actor })).status()).toBe(404);
    expect((await request.get(path + "/" + p.id)).status()).toBe(401);
  }
});
function mPayload(p: ReturnType<typeof payload>) {
  return p.workout.sets[0].metrics;
}
test("ID canónico, respuestas perdidas y tombstones no duplican ni recrean", async ({
  request,
}) => {
  const headers = await login(request),
    p = payload(7);
  const upper = JSON.parse(
    JSON.stringify(p, (_key, value) =>
      typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value) ? value.toUpperCase() : value,
    ),
  );
  const created = await request.post(path, { headers, data: { version: 3, payload: upper } });
  expect(created.status()).toBe(200);
  expect((await created.json()).workoutId).toBe(p.id);
  const retry = await request.post(path, { headers, data: { version: 3, payload: p } });
  expect((await retry.json()).status).toBe("duplicate");
  expect((await request.get(path + "/" + p.id.toUpperCase(), { headers })).status()).toBe(200);
  const changed = structuredClone(p);
  changed.workout.sets[0].effort = 9;
  expect(
    (await request.post(path, { headers, data: { version: 3, payload: changed } })).status(),
  ).toBe(409);
  const removed = await admin().from("workouts").delete().eq("id", p.id);
  expect(removed.error).toBeNull();
  expect((await request.post(path, { headers, data: { version: 3, payload: p } })).status()).toBe(
    422,
  );
  expect((await request.get(path + "/" + p.id, { headers })).status()).toBe(404);
});
test("contenido inválido nunca guarda una cabecera parcial ni admite identidad por parámetros", async ({
  request,
}) => {
  const headers = await login(request),
    p = payload(5),
    data = { version: 3, payload: p };
  for (const value of [
    { ...data, version: 4 },
    { ...data, studentId: p.id },
    {
      ...data,
      payload: {
        ...p,
        workout: {
          ...p.workout,
          sets: [{ ...p.workout.sets[0], metrics: { ...p.workout.sets[0].metrics, reps: 1 } }],
        },
      },
    },
  ])
    expect((await request.post(path, { headers, data: value })).status()).toBe(400);
  expect((await request.post(path + "?studentId=" + p.id, { headers, data })).status()).toBe(400);
  expect(
    (await request.post(path, { headers, data: { padding: "x".repeat(270000) } })).status(),
  ).toBe(413);
  expect((await request.get(path + "/" + p.id + "?studentId=" + p.id, { headers })).status()).toBe(
    400,
  );
  expect((await admin().from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
});
test("núcleo y cliente nativos cierran cada tipo contra SQL real y recuperan una respuesta perdida", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("Falta el servidor aislado");
  let credential: string | null = null,
    loseResponse = true;
  const transport: Transport = async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith("/typed-recordings") && response.ok && loseResponse) {
      loseResponse = false;
      // The server committed. Simulate losing only its successful reply.
      throw Error("lost-response");
    }
    return response;
  };
  const client = new MobileClient(
    baseURL,
    {
      get: async () => credential,
      set: async (value) => {
        credential = value;
      },
      remove: async () => {
        credential = null;
      },
    },
    transport,
    Date.now,
    true,
  );
  await client.login(email, password);
  const session = client.getSnapshot();
  if (session.status !== "authenticated") throw Error("Sin identidad");
  const userId = session.session.profile.id;
  for (const [index, metrics] of trainingMetricCases.entries()) {
    const p = payload(index);
    if (p.source !== "free") throw Error("fixture");
    const context = typedContextSchema.parse({
      version: 3,
      origin: { kind: "free" },
      title: p.workout.title,
      sessionLabel: "Libre",
      exercises: p.structure.exercises.map((r, i) => ({
        sessionExerciseId: r.id,
        exerciseId: r.exerciseId,
        name: `Tipo HTTP ${i ? 0 : index}`,
        isBodyweight: false,
        prescribed: r.prescribed,
        lastMetrics: null,
        note: r.note,
        restSeconds: r.restSeconds,
        supersetId: r.supersetId,
        supersetRestSeconds: r.supersetRestSeconds,
        alternatives: [],
      })),
    });
    let draft = createTypedDraft({ context, workoutId: p.id, userId, now: new Date() });
    const raw = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
    for (const [field, value] of [
      ["weight", raw(metrics.weightKg)],
      ["reps", raw(metrics.reps)],
      ["duration", raw(metrics.durationSeconds)],
      ["distance", raw(metrics.distanceMeters)],
      ["effort", "8,5"],
    ] as const)
      draft = editTypedSet(draft, 0, 0, field, value);
    draft.exercises[0].sets[0].setType = "drop";
    draft.exercises[1].athleteNote = "Sin series, con nota";
    draft = completeTypedSet(draft, 0, 0, new Date(), 0).draft;
    const restored = typedDraftSchema.parse(JSON.parse(JSON.stringify(draft)));
    const built = buildTypedRecording(context, restored, new Date());
    if (!built.ok) throw Error("No se construyó el cierre nativo");
    const document = built.payload,
      encoded = JSON.stringify(document);
    if (index === 0) {
      await expect(client.saveTypedRecording(document, userId)).rejects.toMatchObject({
        code: "network",
      });
      await client.reconnect();
    }
    expect(await client.saveTypedRecording(document, userId)).toMatchObject({
      version: 3,
      workoutId: document.id,
      status: index === 0 ? "duplicate" : "created",
    });
    expect(JSON.stringify(document)).toBe(encoded);
    const read = await client.typedWorkout(document.id);
    expect(read.workout.exercises[0].sets[0]).toMatchObject({
      metrics,
      setType: "drop",
      effort: 8.5,
    });
    expect(read.workout.exercises[1]).toMatchObject({
      athleteNote: "Sin series, con nota",
      sets: [],
    });
    const rows = await admin().from("workouts").select("id").eq("id", document.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
  }
});
