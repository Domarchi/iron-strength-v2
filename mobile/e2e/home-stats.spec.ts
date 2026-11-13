import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { enterWeekUser, setupDownloadedWeek } from "./support/week-fixture";

const origin = "https://iron-strength-seven.vercel.app";

for (const theme of ["dark", "light"] as const)
  test(`Inicio muestra racha, entrenamientos y logros reales · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    // Sin nada que contar no se muestran tarjetas ni ceros.
    await expect(page.getByRole("group", { name: "Tu constancia" })).toHaveCount(0);
    await page.route(origin + "/api/mobile/v1/achievements", (route) =>
      route.fulfill({
        json: {
          version: 1,
          streak: { current: 1, longest: 4 },
          workoutCount: 12,
          earned: [
            { kind: "first_workout", earnedAt: "2026-10-01T12:00:00.000Z" },
            { kind: "workouts_10", earnedAt: "2026-10-20T12:00:00.000Z" },
          ],
        },
      }),
    );
    await page.reload();
    await enterWeekUser(page);
    const group = page.getByRole("group", { name: "Tu constancia" });
    await expect(group).toBeVisible();
    await expect(
      group.getByLabel(/Racha: 1 semana cumplida seguidas; la mejor fue de 4/),
    ).toBeVisible();
    await expect(group.getByLabel("Entrenamientos: 12 entrenamientos guardados")).toBeVisible();
    await expect(group.getByLabel("Logros: 2 logros obtenidos")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
