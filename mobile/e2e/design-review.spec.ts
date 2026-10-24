import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["dark", "light"] as const) {
  test(`referencia ${theme}: cuatro pantallas accesibles con datos demo`, async ({ page }) => {
    for (const view of ["home", "workout", "progress", "coach"]) {
      await page.setViewportSize(
        view === "coach" ? { width: 1280, height: 900 } : { width: 390, height: 844 },
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/design-review/index.html?view=${view}&theme=${theme}&capture=1`);
      await expect(page.getByText("DEMO", { exact: true }).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`${view}-${theme}.png`),
        fullPage: true,
      });
    }
  });
}

test("recorre diseño, registra y revisa asignación sin enviar datos", async ({ page }) => {
  const writes: string[] = [],
    runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.goto("/design-review/index.html");
  await expect(
    page.getByRole("heading", { name: "Referencia visual de Iron Strength" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tema claro", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Continuar sesión", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 2", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 2", exact: true }),
  ).toBeChecked();
  await expect(page.getByText("Descanso de demostración", { exact: true })).toBeVisible();
  await expect(page.locator("#workout-summary")).toHaveText("· 8/11 series");
  await page.getByRole("button", { name: "Inicio", exact: true }).first().click();
  await expect(
    page.getByText("4 ejercicios · 11 series · 8 realizadas", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progreso", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Cada semana, más fuerte." })).toBeVisible();
  await page.getByRole("button", { name: "Editor del coach", exact: true }).click();
  await page.getByRole("button", { name: "Revisar asignación", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("No se asignará ningún programa real.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver al editor", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(writes).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("referencia a 360 px conserva controles y foco de revisión", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/design-review/index.html?view=coach&theme=light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const review = page.getByRole("button", { name: "Revisar asignación", exact: true });
  await review.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(review).toBeFocused();
  for (const button of await page.getByRole("button").all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
