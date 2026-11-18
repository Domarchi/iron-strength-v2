import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupTrainingProgress } from "./support/training-progress-fixture";

for (const theme of ["dark", "light"] as const)
  test(`el historial marca los entrenamientos que mejoraron una marca · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupTrainingProgress(page);
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    const badges = page.getByText(/^Récord · \d+ marcas? mejoradas?$/);
    await expect(badges.first()).toBeVisible();
    expect(await badges.count()).toBeLessThan(
      await page.getByRole("button", { name: /^Ver entrenamiento del / }).count(),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
