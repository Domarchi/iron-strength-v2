import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

for (const theme of ["dark", "light"] as const)
  test(`cronómetro EMOM y AMRAP con reloj controlado · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Cronómetro EMOM / AMRAP", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cronómetro" })).toBeVisible();
    // EMOM de 3 rondas de 15 s.
    for (let i = 0; i < 7; i++)
      await page.getByRole("button", { name: "Bajar Rondas", exact: true }).click();
    await expect(page.getByLabel("Rondas", { exact: true })).toHaveAttribute("aria-valuetext", "3");
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "Bajar Segundos por ronda", exact: true }).click();
    await expect(page.getByText("Duración total: 0:45")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.clock.install();
    await page.getByRole("button", { name: "Empezar cronómetro", exact: true }).click();
    await expect(page.getByText("Ronda 1 de 3")).toBeVisible();
    await page.clock.fastForward(16_000);
    await expect(page.getByText("Ronda 2 de 3")).toBeVisible();
    // Pausar congela el tiempo aunque pase el reloj.
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page.getByText("En pausa")).toBeVisible();
    await page.clock.fastForward(60_000);
    await page.getByRole("button", { name: "Reanudar", exact: true }).click();
    await expect(page.getByText("Ronda 2 de 3")).toBeVisible();
    await page.clock.fastForward(30_000);
    await expect(page.getByRole("heading", { name: "¡Terminado!" })).toBeVisible();
    await page.getByRole("button", { name: "Nuevo cronómetro", exact: true }).click();
    await page.getByRole("radio", { name: "AMRAP", exact: true }).click();
    await expect(page.getByText("Duración total: 12:00")).toBeVisible();
  });
