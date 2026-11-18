import type { Page } from "@playwright/test";

/** Las rutinas de ejemplo de Entrenar están plegadas; las abre si hace falta. */
export async function showDemos(page: Page) {
  const demo = page.getByRole("button", { name: /^Ver demo /, exact: false }).first();
  if (await demo.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Rutinas de ejemplo", exact: true }).click();
}

export async function openDemo(page: Page, label: string) {
  await showDemos(page);
  await page.getByRole("button", { name: `Ver demo ${label}`, exact: true }).click();
}
