import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";

const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1";

for (const theme of ["dark", "light"] as const)
  test(`logros: obtenidos con fecha y pendientes con avance real · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.route(origin + "/achievements", (route) =>
      route.fulfill({
        json: {
          version: 1,
          streak: { current: 2, longest: 2 },
          workoutCount: 12,
          earned: [
            { kind: "first_workout", earnedAt: "2026-10-01T15:00:00.000Z" },
            { kind: "workouts_10", earnedAt: "2026-10-20T15:00:00.000Z" },
          ],
        },
      }),
    );
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Logros", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Logros" })).toBeVisible();
    await expect(page.getByText("2 de 6 obtenidos. Son permanentes: no se pierden.")).toBeVisible();
    await expect(page.getByLabel("Primer entrenamiento. Obtenido")).toContainText(
      "Obtenido el 1 de octubre de 2026",
    );
    await expect(page.getByLabel("25 entrenamientos. Pendiente")).toContainText("Llevas 12 de 25.");
    await expect(page.getByLabel("4 semanas seguidas. Pendiente")).toContainText("Llevas 2 de 4.");
    // Sin récord confirmado no se inventa avance.
    await expect(page.getByLabel("Primer récord. Pendiente")).not.toContainText("Llevas");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
