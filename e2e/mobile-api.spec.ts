import { expect, test } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import { mobileSessionSchema } from "../src/lib/mobile/contracts";

import { isMobileTestBackend } from "../src/lib/testing/mobile-backend";

let alice: string, bob: string, aliceSession: string, bobSession: string;
const email = "mobile@iron-strength.e2e.test";
const password = "Mobile-local-only-2026!";
test.beforeAll(async () => {
  if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
    throw Error("Prueba móvil solo en 55321 o runner efímero hospedado por GitHub");
  await resetAll();
  const coach = await seedCoach();
  alice = await createUser(admin(), {
    role: "student",
    name: "Ana móvil",
    email,
    password,
    coachId: coach,
  });
  bob = await createUser(admin(), {
    role: "student",
    name: "Bruno móvil",
    email: "mobile-bob@iron-strength.e2e.test",
    password,
    coachId: coach,
  });
  aliceSession = (await seedProgram({ coachId: coach, studentId: alice })).sessionId;
  bobSession = (await seedProgram({ coachId: coach, studentId: bob })).sessionId;
});
test("la frontera móvil devuelve JSON privado, limita cuerpos y omite cookies web", async ({
  page,
  request,
}) => {
  const noSession = await request.get("/api/mobile/v1/week", { maxRedirects: 0 });
  expect(noSession.status()).toBe(401);
  expect(noSession.headers()["cache-control"]).toContain("no-store");
  expect(noSession.headers()["vary"]).toContain("Authorization");
  expect((await noSession.json()).error.code).toBe("unauthorized");
  const big = await request.post("/api/mobile/v1/auth/login", {
    data: { email, password: "x".repeat(17000) },
  });
  expect(big.status()).toBe(413);
  await login(page, COACH.email, COACH.password);
  const cookieOnly = await page.request.get("/api/mobile/v1/week", { maxRedirects: 0 });
  expect(cookieOnly.status()).toBe(401);
  expect(cookieOnly.headers()["set-cookie"]).toBeUndefined();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alumnos", exact: true })).toBeVisible();
});
test("el móvil consulta solo su semana/rutina y salir revoca su refresh sin crear entrenamientos", async ({
  request,
}) => {
  const auth = await request.post("/api/mobile/v1/auth/login", { data: { email, password } });
  expect(auth.status()).toBe(200);
  expect(auth.headers()["set-cookie"]).toBeUndefined();
  const session = mobileSessionSchema.parse(await auth.json());
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const week = await request.get(`/api/mobile/v1/week?studentId=${bob}`, { headers });
  expect(week.status()).toBe(200);
  expect((await week.json()).sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual([
    aliceSession,
  ]);
  const preview = await request.get(`/api/mobile/v1/sessions/${aliceSession}`, { headers });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).exercises).toHaveLength(2);
  const foreign = await request.get(`/api/mobile/v1/sessions/${bobSession}`, { headers });
  expect(foreign.status()).toBe(404);

  const download = await request.get("/api/mobile/v1/week/download", { headers });
  expect(download.status()).toBe(200);
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(download.headers()["set-cookie"]).toBeUndefined();
  const pack = (await download.json()).pack;
  expect(pack.userId).toBe(alice);
  expect(
    pack.sessions.map((s: { context: { session: { id: string } } }) => s.context.session.id),
  ).toEqual([aliceSession]);
  expect(Object.keys(pack.history)).toHaveLength(2);
  expect(
    (await request.get("/api/mobile/v1/week/download?studentId=" + bob, { headers })).status(),
  ).toBe(400);
  expect((await request.get("/api/mobile/v1/week/download", { maxRedirects: 0 })).status()).toBe(
    401,
  );
  const rows = await admin().from("workouts").select("id").eq("student_id", alice);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(0);
  const out = await request.post("/api/mobile/v1/auth/logout", {
    headers,
    data: { refreshToken: session.refreshToken },
  });
  expect(out.status()).toBe(200);
  const restored = await request.post("/api/mobile/v1/auth/refresh", {
    data: { refreshToken: session.refreshToken },
  });
  expect(restored.status()).toBe(401);
});

test("el registro móvil se guarda una vez y solo su cuenta puede consultar historial y progreso", async ({
  request,
}) => {
  for (const path of ["workouts", "progress", "workouts/11111111-1111-4111-8111-111111111111"]) {
    const r = await request.get("/api/mobile/v1/" + path, { maxRedirects: 0 });
    expect(r.status()).toBe(401);
    expect(r.headers()["cache-control"]).toContain("no-store");
  }
  const auth = mobileSessionSchema.parse(
      await (await request.post("/api/mobile/v1/auth/login", { data: { email, password } })).json(),
    ),
    headers = { Authorization: `Bearer ${auth.accessToken}` };
  const routine = await (
      await request.get(`/api/mobile/v1/sessions/${aliceSession}`, { headers })
    ).json(),
    exercise = routine.exercises[0],
    id = crypto.randomUUID();
  const payload = {
    id,
    programId: routine.session.programId,
    programSessionId: aliceSession,
    sessionLabel: routine.session.label,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: 0,
    perceivedEffort: 6,
    note: "Entrenamiento desde móvil",
    sets: [
      {
        sessionExerciseId: exercise.sessionExerciseId,
        prescribedExerciseId: exercise.exerciseId,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        position: 0,
        setNumber: 1,
        weightKg: 30,
        reps: 10,
        isWarmup: false,
      },
    ],
  };
  try {
    const big = await request.post("/api/mobile/v1/workouts", {
      headers,
      data: { version: 1, payload: { ...payload, note: "x".repeat(270000) } },
    });
    expect(big.status()).toBe(413);
    const first = await request.post("/api/mobile/v1/workouts", {
      headers,
      data: { version: 1, payload },
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, status: "created", workoutId: id });
    expect(first.headers()["set-cookie"]).toBeUndefined();
    const duplicate = await request.post("/api/mobile/v1/workouts", {
      headers,
      data: { version: 1, payload },
    });
    expect((await duplicate.json()).status).toBe("duplicate");
    const history = await request.get("/api/mobile/v1/workouts?studentId=" + bob, { headers });
    expect((await history.json()).items.map((w: { id: string }) => w.id)).toContain(id);
    const detail = await request.get(`/api/mobile/v1/workouts/${id}`, { headers });
    expect(detail.status()).toBe(200);
    expect(await detail.json()).toMatchObject({
      workout: { note: "Entrenamiento desde móvil", summary: { volumeKg: 300, workingSets: 1 } },
    });
    const progress = await request.get("/api/mobile/v1/progress", { headers });
    expect((await progress.json()).exercises[0].bestWeightKg).toBe(30);
    const evidence = await request.get(`/api/mobile/v1/progress/${exercise.exerciseId}`, {
      headers,
    });
    expect(evidence.status()).toBe(200);
    expect(evidence.headers()["cache-control"]).toContain("no-store");
    expect(evidence.headers()["set-cookie"]).toBeUndefined();
    expect(await evidence.json()).toMatchObject({
      version: 1,
      exercise: { exerciseId: exercise.exerciseId, bestWeightKg: 30 },
      points: [{ workoutId: id, volumeKg: 300 }],
    });
    expect(
      (
        await request.get(`/api/mobile/v1/progress/${exercise.exerciseId}?studentId=${bob}`, {
          headers,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.get(`/api/mobile/v1/progress/${exercise.exerciseId}`, { maxRedirects: 0 })
      ).status(),
    ).toBe(401);

    const bobAuth = mobileSessionSchema.parse(
      await (
        await request.post("/api/mobile/v1/auth/login", {
          data: { email: "mobile-bob@iron-strength.e2e.test", password },
        })
      ).json(),
    );
    expect(
      (
        await request.get(`/api/mobile/v1/workouts/${id}`, {
          headers: { Authorization: `Bearer ${bobAuth.accessToken}` },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.get(`/api/mobile/v1/progress/${exercise.exerciseId}`, {
          headers: { Authorization: `Bearer ${bobAuth.accessToken}` },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await admin().from("workouts").select("id", { count: "exact", head: true }).eq("id", id))
        .count,
    ).toBe(1);
  } finally {
    await admin().from("workouts").delete().eq("id", id);
  }
});
