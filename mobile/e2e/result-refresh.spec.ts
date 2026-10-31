import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupCorrection } from "./support/correction-fixture";
import { setupTrainingProgress } from "./support/training-progress-fixture";
import { typedResultFixture } from "../../src/test/fixtures/typed-result";
import { downloadId } from "../../src/test/fixtures/week-download";
for (const theme of ["light", "dark"] as const)
  for (const modern of [false, true]) {
    test(`resultado ${modern ? "tipado" : "legado"} compacto con opciones protegidas · ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const c = await setupCorrection(page);
      if (modern) {
        const { result } = typedResultFixture();
        result.workout.id = c.base.workout.id;
        result.workout.title = "Fuerza revisada";
        await page.route(
          "https://iron-strength-seven.vercel.app/api/mobile/v1/typed-recordings/" +
            c.base.workout.id,
          (route) => route.fulfill({ json: result }),
        );
      }
      await page.getByRole("tab", { name: "Historial", exact: true }).click();
      await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
      await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
      const week = page.getByRole("button", { name: "Volver a mi semana", exact: true });
      await expect(week).toBeVisible();
      await expect
        .poll(async () => (await week.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
        .toBeLessThan(360);
      await expect(
        page.getByRole("button", { name: "Corregir entrenamiento", exact: true }),
      ).toHaveCount(0);
      const options = page.getByRole("button", { name: "Opciones del entrenamiento", exact: true });
      await options.click();
      const panel = page.getByRole("dialog", { name: "Opciones del entrenamiento", exact: true });
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Corregir entrenamiento", exact: true }),
      ).toBeEnabled();
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(options).toBeFocused();
      await page.screenshot({
        path: test.info().outputPath(`result-${modern ? "typed" : "legacy"}-${theme}-360.png`),
      });
      await options.click();
      await panel.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Revisar corrección", exact: true }),
      ).toBeVisible();
      expect(c.calls).toHaveLength(0);
    });
  }
test("volver al historial conserva filtro y posición del listado", async ({ page }) => {
  const { control } = await setupTrainingProgress(page);
  const original = control.source.workouts[0];
  control.source.workouts = Array.from({ length: 40 }, (_, i) => ({
    ...original,
    id: downloadId(8900 + i),
    title: `Fuerza ${i}`,
    startedAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T15:00:00Z`,
    date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
    sets: original.sets.map((s) => ({ ...s, id: downloadId(9000 + i) })),
  }));
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar en historial", exact: true }).fill("sentadilla");
  const target = page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza 23$/ });
  await target.scrollIntoViewIfNeeded();
  const scroll = await page.getByTestId("history-list").evaluate((el) => el.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await target.click();
  await page.getByRole("button", { name: "Volver al historial", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Buscar en historial", exact: true })).toHaveValue(
    "sentadilla",
  );
  await expect
    .poll(() => page.getByTestId("history-list").evaluate((el) => el.scrollTop))
    .toBeCloseTo(scroll, 0);
});

test("una nota extensa se puede leer completa sin modificar el resultado", async ({ page }) => {
  const c = await setupCorrection(page);
  const note = "Controlar la bajada y mantener el ritmo. ".repeat(10);
  c.base.workout.note = note;
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  const text = page.getByText(note.trim(), { exact: true });
  await expect(text).toBeVisible();
  await expect.poll(async () => (await text.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  const before = (await text.boundingBox())!.height;
  await page.getByRole("button", { name: "Leer Nota del entrenamiento", exact: true }).click();
  await expect.poll(async () => (await text.boundingBox())?.height ?? 0).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Contraer Nota del entrenamiento", exact: true }).click();
  await expect.poll(async () => (await text.boundingBox())?.height ?? 0).toBe(before);
  expect(c.base.workout.note).toBe(note);
  expect(c.calls).toHaveLength(0);
});
