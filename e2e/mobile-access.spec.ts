import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { admin, resetAll, seedCoach } from "./support/db";
import { isMobileTestBackend } from "../src/lib/testing/mobile-backend";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada de pruebas");
const token = "a".repeat(43),
  email = "native-access@iron-strength.e2e.test",
  password = "Solo-E2E-192-segura";
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  const result = await admin()
    .from("invitations")
    .insert({
      coach_id: coachId,
      email,
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
  expect(result.error).toBeNull();
});
test("web ofrece abrir en app; consulta y registro móvil funcionan sin cookies", async ({
  page,
  request,
}) => {
  await page.goto("/invite/" + token);
  await expect(
    page.getByRole("link", { name: "Abrir en Iron Strength", exact: true }),
  ).toHaveAttribute("href", `iron-strength://access?kind=invite&token=${token}`);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  const check = await request.post("/api/mobile/v1/auth/invitation", { data: { token } });
  expect(check.status()).toBe(200);
  expect(await check.json()).toMatchObject({ status: "valida", email });
  const created = await request.post("/api/mobile/v1/auth/register", {
    data: { token, name: "Alumno móvil E2E", password },
  });
  expect(created.status()).toBe(201);
  expect(created.headers()["set-cookie"]).toBeUndefined();
  expect(created.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await request.post("/api/mobile/v1/auth/register", {
        data: { token, name: "Repetida", password },
      })
    ).status(),
  ).toBe(410);
  const login = await request.post("/api/mobile/v1/auth/login", { data: { email, password } });
  expect(login.status()).toBe(200);
});
test("abrir recuperación web no consume; endpoint móvil cambia una vez y conserva el acceso explícito", async ({
  page,
  request,
}) => {
  const link = await admin().auth.admin.generateLink({ type: "recovery", email });
  if (link.error || !link.data.properties) throw Error("No se pudo preparar enlace de prueba");
  const reset = link.data.properties.hashed_token;
  await page.goto("/reset/" + reset);
  await expect(
    page.getByRole("link", { name: "Abrir en Iron Strength", exact: true }),
  ).toHaveAttribute("href", `iron-strength://access?kind=reset&token=${reset}`);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(
    (
      await request.post("/api/mobile/v1/auth/reset-password", {
        data: { token: reset, password: "corta" },
      })
    ).status(),
  ).toBe(400);
  const saved = await request.post("/api/mobile/v1/auth/reset-password", {
    data: { token: reset, password: password + "-nueva" },
  });
  expect(saved.status()).toBe(200);
  expect(saved.headers()["set-cookie"]).toBeUndefined();
  expect(
    (
      await request.post("/api/mobile/v1/auth/reset-password", {
        data: { token: reset, password: password + "-otra" },
      })
    ).status(),
  ).toBe(410);
  expect(
    (
      await request.post("/api/mobile/v1/auth/login", {
        data: { email, password: password + "-nueva" },
      })
    ).status(),
  ).toBe(200);
});
