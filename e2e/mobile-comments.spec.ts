import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { isMobileTestBackend } from "../src/lib/testing/mobile-backend";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo base aislada");
const email = "comments-mobile@iron-strength.e2e.test",
  password = "Solo-E2E-comments-195!";
let workoutId: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  const studentId = await createUser(admin(), {
    role: "student",
    name: "Ana comentarios",
    email,
    password,
    coachId,
  });
  await createUser(admin(), {
    role: "student",
    name: "Otra cuenta",
    email: "comments-other@iron-strength.e2e.test",
    password,
    coachId,
  });
  workoutId = randomUUID();
  expect(
    (
      await admin().from("workouts").insert({
        id: workoutId,
        student_id: studentId,
        started_at: "2026-10-20T16:00:00Z",
        finished_at: "2026-10-20T16:30:00Z",
        duration_seconds: 1800,
      })
    ).error,
  ).toBeNull();
});
test("coach comenta en web; móvil propio lee, responde sin duplicar y solo borra lo propio", async ({
  page,
  request,
}) => {
  await login(page, COACH.email, COACH.password);
  await page.goto("/history/" + workoutId);
  await page
    .getByLabel("Escribe un comentario", { exact: true })
    .fill("Buen control. Mantén esta carga.");
  await page.getByRole("button", { name: "Publicar comentario", exact: true }).click();
  await expect(page.getByText("Buen control. Mantén esta carga.", { exact: true })).toBeVisible();
  const path = "/api/mobile/v1/workouts/" + workoutId + "/comments";
  const session = await (
    await request.post("/api/mobile/v1/auth/login", { data: { email, password } })
  ).json();
  const headers = { Authorization: "Bearer " + session.accessToken };
  const get = await request.get(path, { headers });
  expect(get.status()).toBe(200);
  expect(get.headers()["cache-control"]).toContain("no-store");
  expect(get.headers()["set-cookie"]).toBeUndefined();
  const conversation = await get.json();
  expect(conversation.unreadCount).toBe(1);
  expect(conversation.items[0]).toMatchObject({
    body: "Buen control. Mantén esta carga.",
    mine: false,
    authorKind: "coach",
  });
  const coach = await (
    await request.post("/api/mobile/v1/auth/login", {
      data: { email: COACH.email, password: COACH.password },
    })
  ).json();
  expect(
    (
      await request.get(path, { headers: { Authorization: "Bearer " + coach.accessToken } })
    ).status(),
  ).toBe(404);
  const other = await (
    await request.post("/api/mobile/v1/auth/login", {
      data: { email: "comments-other@iron-strength.e2e.test", password },
    })
  ).json();
  expect(
    (
      await request.get(path, { headers: { Authorization: "Bearer " + other.accessToken } })
    ).status(),
  ).toBe(404);
  const id = randomUUID(),
    data = { id, body: "Me quedó una repetición en reserva." };
  const created = await request.post(path, { headers, data });
  expect(created.status()).toBe(201);
  expect((await (await request.post(path, { headers, data })).json()).status).toBe("duplicate");
  expect(
    (await request.post(path, { headers, data: { ...data, body: "Otro texto" } })).status(),
  ).toBe(409);
  expect(
    (
      await request.post(path + "/delete", { headers, data: { id: conversation.items[0].id } })
    ).status(),
  ).toBe(403);
  expect(
    (await (await request.post(path + "/delete", { headers, data: { id } })).json()).status,
  ).toBe("deleted");
  expect(
    (await (await request.post(path + "/delete", { headers, data: { id } })).json()).status,
  ).toBe("absent");
  const removed = await request.post(path, { headers, data });
  expect(removed.status()).toBe(409);
  expect((await removed.json()).error.code).toBe("removed");
  expect((await request.post(path + "/read", { headers, data: {} })).status()).toBe(200);
  expect(
    (await (await request.get("/api/mobile/v1/comments/unread", { headers })).json()).items,
  ).toEqual([]);
});
