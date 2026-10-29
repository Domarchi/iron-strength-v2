import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, resetAll, seedCoach, createUser } from "./support/db";
import { login } from "./support/ui";
let owner: string, ids: string[], at: string;
const account = {
  name: "Alumno Páginas",
  email: "history-pages@iron-strength.e2e.test",
  password: "Pages-local-only-2026!",
};
test.beforeEach(async () => {
  await resetAll();
  const coachId = await seedCoach();
  owner = await createUser(admin(), { ...account, role: "student", coachId });
  at = new Date().toISOString();
  ids = Array.from({ length: 21 }, () => randomUUID());
  expect(
    (
      await admin()
        .from("workouts")
        .insert(
          ids.map((id, i) => ({
            id,
            student_id: owner,
            started_at: at,
            finished_at: at,
            duration_seconds: 0,
            note: `Nota ${i}`,
          })),
        )
    ).error,
  ).toBeNull();
});
test.afterAll(async () => {
  await resetAll();
});
test("historial web y API1 recorren21empates sin pérdida y explican un cursor anterior ambiguo", async ({
  page,
  request,
}) => {
  await login(page, account.email, account.password);
  await page.goto("/history");
  const links = page.locator('a[href^="/history/"]');
  await expect(links).toHaveCount(20);
  const first = await links.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("href")!.split("/").at(-1)!),
  );
  await page.getByRole("button", { name: "Ver anteriores", exact: true }).click();
  await expect(links).toHaveCount(1);
  const second = await links.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("href")!.split("/").at(-1)!),
  );
  expect(new Set([...first, ...second])).toEqual(new Set(ids));
  await page.goto(`/history?antes=${encodeURIComponent(at)}`);
  await expect(page.getByRole("alert").filter({ hasText: "Esta página anterior" })).toBeVisible();
  await page.getByRole("button", { name: "Volver al historial", exact: true }).click();
  await expect(links).toHaveCount(20);
  const response = await request.post("/api/mobile/v1/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);
  const auth = { Authorization: `Bearer ${(await response.json()).accessToken}` };
  const a = await request.get("/api/mobile/v1/workouts", { headers: auth });
  expect(a.status()).toBe(200);
  const before = await a.json();
  expect(before.version).toBe(1);
  expect(before.items).toHaveLength(20);
  expect(before.nextCursor).toContain(`v2|${owner}|`);
  const b = await request.get(
    "/api/mobile/v1/workouts?cursor=" + encodeURIComponent(before.nextCursor),
    { headers: auth },
  );
  expect(b.status()).toBe(200);
  const after = await b.json();
  expect(after.items).toHaveLength(1);
  expect(after.nextCursor).toBeNull();
  expect(new Set([...before.items, ...after.items].map((w: { id: string }) => w.id))).toEqual(
    new Set(ids),
  );
  const stale = await request.get("/api/mobile/v1/workouts?cursor=" + encodeURIComponent(at), {
    headers: auth,
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.message).toContain("Vuelve al inicio");
});
