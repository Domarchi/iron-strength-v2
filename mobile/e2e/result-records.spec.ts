import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildTrainingProgress } from "../../src/domain/training-progress";
import { progressFixture, setupTrainingProgress } from "./support/training-progress-fixture";

// Primer entrenamiento tipado que mejoró una marca: el fixture solo sirve el detalle de los antiguos.
const recordWorkouts = (() => {
  const source = progressFixture(),
    ids = new Set(
      buildTrainingProgress(source).exercises.flatMap((e) =>
        e.points.filter((p) => p.records.length).map((p) => p.workoutId),
      ),
    );
  return source.workouts.filter((w) => ids.has(w.id));
})();

test("el resultado muestra los récords que mejoró ese entrenamiento", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await setupTrainingProgress(page);
  for (const withRecord of recordWorkouts)
    await page.route("**/api/mobile/v1/workouts/" + withRecord.id, (route) =>
      route.fulfill({
        json: {
          version: 1,
          workout: {
            id: withRecord.id,
            sourceKind: withRecord.sourceKind,
            title: withRecord.title,
            programName: null,
            sessionLabel: null,
            startedAt: withRecord.startedAt,
            performedOn: withRecord.date,
            durationSeconds: withRecord.durationSeconds,
            perceivedEffort: null,
            note: null,
            summary: { workingSets: 1, volumeKg: 100, bodyweightReps: 0, exerciseCount: 1 },
            exercises: [],
          },
        },
      }),
    );
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  const badge = page.getByText(/^Récord · \d+ marcas? mejoradas?$/).first();
  await expect(badge).toBeVisible();
  // Abre el entrenamiento que tiene la marca de récord.
  await page
    .getByRole("button", { name: /^Ver entrenamiento del / })
    .filter({ has: page.getByText(/^Récord · /) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/result\//);
  await expect(page.getByText(/^\d+ récords? nuevos?$/)).toBeVisible();
  await expect(page.getByText(/\(antes /).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
