import { expect, type Page } from "@playwright/test";

/** Follow the visible result menu; never click controls behind a modal. */
export async function openResultOptions(page: Page) {
  await expect(page).toHaveURL(/\/(?:result|save-routine)\/[^/?]+(?:\?|$)/);
  // The save-routine screen also has an existing explicit update-mode selector.
  if (new URL(page.url()).pathname.startsWith("/save-routine/")) return;
  const panel = page.getByRole("dialog", { name: "Opciones del entrenamiento", exact: true });
  if (await panel.isVisible()) return;
  await page.getByRole("button", { name: "Opciones del entrenamiento", exact: true }).click();
  await expect(panel).toBeVisible();
}
