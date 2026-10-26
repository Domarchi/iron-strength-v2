import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { mobileSessionSchema } from "../src/lib/mobile/contracts";
const password = "Personal-local-only-2026!";
const emails = Array.from({ length: 3 }, (_, i) => `personal-workout-${i}@iron-strength.e2e.test`);
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (const email of emails)
    await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId });
});
const login = async (request: APIRequestContext, email = emails[0]) => {
  const response = await request.post("/api/mobile/v1/auth/login", {
    data: { email, password: email === COACH.email ? COACH.password : password },
  });
  expect(response.status()).toBe(200);
  const auth = mobileSessionSchema.parse(await response.json());
  return { Authorization: `Bearer ${auth.accessToken}` };
};
test("registro libre HTTP es privado, atómico, idempotente y rechaza destinos arbitrarios", async ({
  request,
}) => {
  const path = "/api/mobile/v1/personal-workouts";
  expect((await request.post(path, { data: {} })).status()).toBe(401);
  const headers = await login(request);
  const catalog = await (await request.get("/api/mobile/v1/exercises", { headers })).json();
  const exerciseId = catalog.exercises[0].id;
  const now = new Date();
  const payload = {
    version: 1,
    id: randomUUID(),
    origin: { kind: "free" },
    title: "Sesión libre",
    startedAt: new Date(now.getTime() - 60000).toISOString(),
    finishedAt: now.toISOString(),
    durationSeconds: 60,
    sets: [{ exerciseId, position: 0, setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
  };
  for (const extra of [{ studentId: randomUUID() }, { programId: randomUUID() }])
    expect(
      (
        await request.post(path, {
          headers,
          data: { version: 1, payload: { ...payload, ...extra } },
        })
      ).status(),
    ).toBe(400);
  const results = await Promise.all([
    request.post(path, { headers, data: { version: 1, payload } }),
    request.post(path, { headers, data: { version: 1, payload } }),
  ]);
  const receipts = [];
  for (const r of results) {
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["set-cookie"]).toBeUndefined();
    const receipt = await r.json();
    expect(receipt.workoutId).toBe(payload.id);
    receipts.push(receipt.status);
  }
  expect(receipts.sort()).toEqual(["created", "duplicate"]);
  expect(
    (
      await request.post(path, {
        headers,
        data: { version: 1, payload: { ...payload, title: "Otro" } },
      })
    ).status(),
  ).toBe(409);
  const result = await request.get("/api/mobile/v1/workouts/" + payload.id, { headers });
  expect(result.status()).toBe(200);
  expect((await result.json()).workout.exercises[0].sets).toHaveLength(1);
  for (const email of emails.slice(1)) {
    const other = await login(request, email);
    expect(
      (await request.get("/api/mobile/v1/workouts/" + payload.id, { headers: other })).status(),
    ).toBe(404);
  }
  const coachHeaders = await login(request, COACH.email);
  const own = await request.get("/api/mobile/v1/workouts/" + payload.id, { headers: coachHeaders });
  expect(own.status()).toBe(404); // Native coach API stays own-only; web review uses existing RLS.
  const sql = await admin()
    .from("workouts")
    .select("source_kind,program_id,program_session_id,session_label")
    .eq("id", payload.id)
    .single();
  expect(sql.data).toMatchObject({
    source_kind: "free",
    program_id: null,
    program_session_id: null,
    session_label: null,
  });
});
test("base personal HTTP mantiene procedencia y un registro borrado no reaparece", async ({
  request,
}) => {
  const headers = await login(request);
  const routineId = randomUUID();
  expect(
    (
      await request.post("/api/mobile/v1/library/mutations", {
        headers,
        data: {
          version: 1,
          requestId: randomUUID(),
          targetId: routineId,
          operation: "routine_create",
          expectedRevision: 0,
          data: { name: "Base privada", folderId: null, items: [] },
        },
      })
    ).status(),
  ).toBe(200);
  const library = await (await request.get("/api/mobile/v1/library", { headers })).json();
  const base = library.routines.find((r: { id: string }) => r.id === routineId);
  const catalog = await (await request.get("/api/mobile/v1/exercises", { headers })).json();
  const now = new Date();
  const payload = {
    version: 1,
    id: randomUUID(),
    origin: { kind: "personal", routineId, revision: base.revision },
    title: "Desde mi base",
    startedAt: new Date(now.getTime() - 60000).toISOString(),
    finishedAt: now.toISOString(),
    durationSeconds: 60,
    sets: [
      {
        exerciseId: catalog.exercises[0].id,
        position: 0,
        setNumber: 1,
        weightKg: 35,
        reps: 6,
        isWarmup: false,
      },
    ],
  };
  const send = () =>
    request.post("/api/mobile/v1/personal-workouts", { headers, data: { version: 1, payload } });
  expect((await send()).status()).toBe(200);
  expect((await admin().from("workouts").delete().eq("id", payload.id)).error).toBeNull();
  const replay = await send();
  expect(replay.status()).toBe(422);
  expect((await replay.json()).error.code).toBe("removed");
  expect((await admin().from("workouts").select("id").eq("id", payload.id)).data).toHaveLength(0);
});
