import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { downloadId } from "../../src/test/fixtures/week-download";
import { setupDownloadedWeek } from "./support/week-fixture";
import { setupTypedPersonalLibrary } from "./support/typed-library-fixture";
import { setupTrainingProgress } from "./support/training-progress-fixture";
import { enlargeText, horizontalClipping, restoreText } from "./support/text-scale";
for (const theme of ["light", "dark"] as const)
  for (const view of ["home", "account", "workout", "editor", "progress"] as const) {
    test(`texto ampliado sin recortes ${view} · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      if (view === "editor") {
        await setupTypedPersonalLibrary(page);
        await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
        await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
        await page.getByRole("checkbox", { name: "Seleccionar Movimiento 0", exact: true }).check();
        await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
      } else if (view === "progress") {
        await setupTrainingProgress(page);
        await page.getByRole("tab", { name: "Progreso", exact: true }).click();
        await page.getByRole("button", { name: /Ver progreso de Sentadilla/ }).click();
      } else {
        await setupDownloadedWeek(page);
        if (view === "account")
          await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
        if (view === "workout") {
          await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
          await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
          await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
          await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
          await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("10");
          await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
          await expect(page.getByTestId("rest-progress")).toBeVisible();
        }
      }
      await enlargeText(page);
      if (view === "workout") {
        const heading = page.getByRole("heading", { name: "Piernas", exact: true });
        const titleLines = await heading.evaluate(
          (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
        );
        expect(
          titleLines,
          "El título corto no debe partir palabras al ampliar texto",
        ).toBeLessThanOrEqual(1.05);
        const timer = await page
          .getByLabel("Tiempo de descanso restante")
          .filter({ visible: true })
          .boundingBox();
        for (const name of ["Restar 15 segundos", "Sumar 15 segundos", "Omitir descanso"]) {
          const button = await page.getByRole("button", { name, exact: true }).boundingBox();
          const overlaps =
            timer &&
            button &&
            timer.x < button.x + button.width &&
            timer.x + timer.width > button.x &&
            timer.y < button.y + button.height &&
            timer.y + timer.height > button.y;
          expect(overlaps, `El reloj no debe cubrir ${name}`).toBe(false);
        }
      }
      if (view === "home" || view === "account") {
        await expect(async () => {
          for (const tab of await page.getByRole("tab").all()) {
            const bounds = await tab.boundingBox();
            const label = await tab.locator('[dir="auto"]').boundingBox();
            expect(label!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
            expect(label!.y + label!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
          }
        }).toPass({ timeout: 5000 });
      }
      const clipping = await horizontalClipping(page);
      await writeFile(
        test.info().outputPath("layout.json"),
        JSON.stringify({ view, theme, width: 360, textScale: 2, clipping }),
      );
      await test.info().attach("layout", {
        body: JSON.stringify({ view, theme, width: 360, textScale: 2, clipping }),
        contentType: "application/json",
      });
      await page.screenshot({ path: test.info().outputPath(`large-${view}-${theme}.png`) });
      expect(clipping).toEqual([]);
      if (view === "home" || view === "account") {
        await restoreText(page);
        await expect(async () => {
          const firstTab = await page.getByRole("tab").first().boundingBox();
          expect(firstTab!.height).toBeLessThanOrEqual(66);
        }).toPass({ timeout: 5000 });
      }
    });
  }
test("actualización retenida conserva valor, foco y posición de búsqueda", async ({ page }) => {
  await setupTrainingProgress(page);
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Buscar ejercicio en progreso", exact: true });
  await expect(input).toBeVisible();
  const before = await input.boundingBox();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/training-progress",
    async (route) => {
      await waiting;
      await route.fallback();
    },
  );
  await page.getByRole("button", { name: "Actualizar progreso", exact: true }).click();
  await input.fill("sentadilla");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", { name: /Ver progreso de Sentadilla/ })).toBeVisible();
  release();
  await expect(
    page.getByRole("button", { name: "Actualizar progreso", exact: true }),
  ).toBeEnabled();
  await expect(input).toHaveValue("sentadilla");
  await expect(input).toBeFocused();
  const after = await input.boundingBox();
  const shift = Math.abs(after!.y - before!.y);
  await test.info().attach("layout", {
    body: JSON.stringify({ shiftY: shift, valueRetained: true, focusRetained: true }),
    contentType: "application/json",
  });
  await writeFile(
    test.info().outputPath("layout.json"),
    JSON.stringify({ shiftY: shift, valueRetained: true, focusRetained: true }),
  );
  expect(shift).toBeLessThanOrEqual(1);
});
for (const reduced of [true, false])
  test(`panel conserva descanso, foco y registro · reducido=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await setupDownloadedWeek(page);
    await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("10");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Detalles del ejercicio", exact: true });
    const start = Date.now();
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "Detalles del ejercicio", exact: true });
    await expect(panel).toBeVisible();
    const opened = Date.now();
    await panel
      .getByRole("textbox", { name: "Nota del ejercicio", exact: true })
      .fill("Nota conservada");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(
      page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
    ).toHaveText("1:00");
    await trigger.click();
    await expect(
      page.getByRole("textbox", { name: "Nota del ejercicio", exact: true }),
    ).toHaveValue("Nota conservada");
    await writeFile(
      test.info().outputPath("timing.json"),
      JSON.stringify({
        reduced,
        openObservedMs: opened - start,
        scope: "Playwright + Expo web, not native frame rate",
      }),
    );
    await test.info().attach("timing", {
      body: JSON.stringify({
        reduced,
        openObservedMs: opened - start,
        scope: "Playwright + Expo web, not native frame rate",
      }),
      contentType: "application/json",
    });
  });

test("cambiar pestaña conserva búsqueda y posición del historial", async ({ page }) => {
  const { control } = await setupTrainingProgress(page);
  const original = control.source.workouts[0];
  control.source.workouts = Array.from({ length: 40 }, (_, i) => ({
    ...original,
    id: downloadId(8900 + i),
    sets: original.sets.map((set, j) => ({ ...set, id: downloadId(9000 + i * 100 + j) })),
    title: `Fuerza ${i}`,
    startedAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T15:00:00Z`,
    date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Buscar en historial", exact: true });
  await search.fill("sentadilla");
  const list = page.getByTestId("history-list");
  await page
    .getByRole("button", { name: /Ver entrenamiento del .*Fuerza 23$/ })
    .scrollIntoViewIfNeeded();
  const scroll = await list.evaluate((el) => el.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(search).toHaveValue("sentadilla");
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
});

test("viewport bajo mantiene campo editable y descanso separados", async ({ page }) => {
  await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 430 });
  const field = page.getByRole("textbox", { name: "REPS serie 2", exact: true });
  await field.scrollIntoViewIfNeeded();
  await field.fill("9");
  await expect(field).toBeFocused();
  const box = await field.boundingBox();
  const rest = await page
    .getByRole("button", { name: "Restar 15 segundos", exact: true })
    .boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(rest!.y);
  await page.screenshot({ path: test.info().outputPath("short-viewport.png") });
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(field).toHaveValue("9");
  await expect(page.getByLabel("Tiempo de descanso restante").filter({ visible: true })).toHaveText(
    "1:00",
  );
});
