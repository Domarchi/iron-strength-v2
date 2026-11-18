import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

for (const theme of ["dark", "light"] as const)
  test(`Inicio muestra la tira de la semana con día actual y sin inventar sesiones · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    const strip = page.getByRole("group", { name: "Días de la semana" });
    await expect(strip).toBeVisible();
    await expect(strip.locator("[aria-label]")).toHaveCount(7);
    // El reloj de la fixture es sábado 24-oct.
    await expect(strip.getByLabel(/sábado 24, hoy/)).toBeVisible();
    // La sesión de la fixture no tiene día fijo: la tira no inventa un día para ella.
    await expect(strip.getByLabel(/sin sesión/)).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
