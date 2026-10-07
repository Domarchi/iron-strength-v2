import { expect, test } from "@playwright/test";
import { COACH, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";

test.beforeAll(async () => {
  await resetAll();
  await seedCoach();
});

test("el coach inicia sesión y llega a su panel; un correo inexistente da el mismo error genérico", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("nadie@test.local");
  await page.getByLabel("Contraseña").fill("incorrecta-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." }),
  ).toBeVisible();

  await login(page, COACH.email, COACH.password);
  await expect(page).toHaveURL(/\/coach\/students/);
  await expect(page.getByRole("heading", { name: "Alumnos", exact: true })).toBeVisible();
});
