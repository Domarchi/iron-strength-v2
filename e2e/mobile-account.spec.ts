import { test, expect } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { isMobileTestBackend } from "../src/lib/testing/mobile-backend";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo base aislada");
const email = "account-native@iron-strength.e2e.test",
  password = "Local-E2E-account-193!";
let id: string, other: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  id = await createUser(admin(), { role: "student", name: "Ana cuenta", email, password, coachId });
  other = await createUser(admin(), {
    role: "student",
    name: "Otra cuenta",
    email: "account-other@iron-strength.e2e.test",
    password,
    coachId,
  });
});
test("borrar por API móvil exige Bearer, rol y confirmación; no acepta destino y confirma solo la cuenta propia", async ({
  request,
}) => {
  const path = "/api/mobile/v1/account/delete";
  expect(
    (await request.post(path, { data: { confirmation: "BORRAR" }, maxRedirects: 0 })).status(),
  ).toBe(401);
  const coach = await request.post("/api/mobile/v1/auth/login", {
    data: { email: COACH.email, password: COACH.password },
  });
  expect(coach.status()).toBe(200);
  const coachSession = await coach.json();
  expect(
    (
      await request.post(path, {
        headers: { Authorization: "Bearer " + coachSession.accessToken },
        data: { confirmation: "BORRAR" },
      })
    ).status(),
  ).toBe(403);
  const auth = await request.post("/api/mobile/v1/auth/login", { data: { email, password } });
  expect(auth.status()).toBe(200);
  const session = await auth.json(),
    headers = { Authorization: "Bearer " + session.accessToken };
  expect(
    (
      await request.post(path, { headers, data: { confirmation: "BORRAR", userId: other } })
    ).status(),
  ).toBe(400);
  expect((await request.post(path, { headers, data: { confirmation: "no" } })).status()).toBe(400);
  const removed = await request.post(path, { headers, data: { confirmation: "BORRAR" } });
  expect(removed.status()).toBe(200);
  expect(await removed.json()).toEqual({ version: 1, ok: true, userId: id });
  expect(removed.headers()["set-cookie"]).toBeUndefined();
  expect(removed.headers()["cache-control"]).toContain("no-store");
  expect((await admin().auth.admin.getUserById(other)).data.user?.id).toBe(other);
  expect(
    (
      await request.post("/api/mobile/v1/auth/refresh", {
        data: { refreshToken: session.refreshToken },
      })
    ).status(),
  ).toBe(401);
});
