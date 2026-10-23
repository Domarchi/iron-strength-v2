import { expect, test } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import { mobileSessionSchema } from "../src/lib/mobile/contracts";

let alice: string, bob: string, aliceSession: string, bobSession: string;
const email = "mobile@iron-strength.e2e.test";
const password = "Mobile-local-only-2026!";
test.beforeAll(async () => {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321")
    throw Error("Prueba móvil solo en la instancia aislada 55321");
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
