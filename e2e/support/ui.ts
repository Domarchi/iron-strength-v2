import { expect, type Page } from "@playwright/test";

// Inicia sesión por la interfaz, como lo haría una persona.
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/(?:coach\/students|week)(?:\?.*)?$/);
  await expect(page.getByRole("button", { name: "Mi cuenta", exact: true })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
}
