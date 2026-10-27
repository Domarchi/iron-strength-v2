import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { enterWeekUser, setupDownloadedWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";

const trainingKey = `is:native-training:v1:${downloadId(1)}`;

for (const theme of ["light", "dark"] as const) {
  test(`referencia anterior explícita, calentamientos y recuperación · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const control = await setupDownloadedWeek(page);
    control.pack.history[downloadId(5)].items = [
      {
        id: downloadId(90),
        startedAt: "2026-10-23T15:00:00Z",
        date: "2026-10-23",
        sessionLabel: "A",
        sets: [
          { id: downloadId(91), position: 0, setNumber: 1, weightKg: 20, reps: 12, isWarmup: true },
          {
            id: downloadId(92),
            position: 0,
            setNumber: 2,
            weightKg: 47.5,
            reps: 7,
            isWarmup: false,
          },
          { id: downloadId(93), position: 0, setNumber: 3, weightKg: 45, reps: 9, isWarmup: false },
        ],
      },
    ];
    await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
    await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
    await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    const weight = page.getByRole("textbox", { name: "Peso serie 1", exact: true });
    await expect(weight).toHaveValue("55");
    const copy = page.getByRole("button", { name: "Copiar anterior a serie 1", exact: true });
    await expect(copy).toContainText("47,5 kg × 7");
    await weight.fill("no");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Serie 1");
    await copy.click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(weight).toHaveValue("47,5");
    await expect(
      page.getByRole("textbox", { name: "Repeticiones serie 1", exact: true }),
    ).toHaveValue("7");
    await page.getByRole("button", { name: "Opciones de serie 1", exact: true }).click();
    await page
      .getByRole("button", { name: "Usar como calentamiento serie 1", exact: true })
      .click();
    await expect(copy).toContainText("20 kg × 12");
    await copy.click();
    await expect(weight).toHaveValue("20");
    await page.getByRole("button", { name: "Usar como trabajo serie 1", exact: true }).click();
    await expect(copy).toContainText("47,5 kg × 7");
    await expect(
      page.getByRole("button", { name: "Copiar anterior a serie 2", exact: true }),
    ).toContainText("45 kg × 9");
    await copy.click();
    await page.getByRole("button", { name: "Opciones de serie 1", exact: true }).click();
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    // La superserie enfoca Remo, cuyo historial está vacío; no reutiliza el de Sentadilla.
    await expect(
      page.getByRole("button", { name: "Copiar anterior a serie 1", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Ir a Sentadilla", exact: true }).click();
    await expect(copy).toBeDisabled();
    await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cambiar a Prensa", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)!).active.draft.exercises[0].sets[0].done,
          trainingKey,
        ),
      )
      .toBe(true);
    await page.reload();
    // Expo web mantiene credenciales solo en memoria; el borrador sí persiste por cuenta.
    await enterWeekUser(page);
    await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
    await expect(weight).toHaveValue("47,5");
    await expect(copy).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
    ).toBeChecked();
    expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // La misma composición apilada se utiliza con texto ampliado.
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(copy).toContainText("Anterior · 47,5 kg × 7");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page
      .getByTestId("app-page")
      .filter({ visible: true })
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await page.screenshot({ path: test.info().outputPath(`workout-${theme}-360.png`) });
  });

  test(`biblioteca, tabla y descanso compactos sin historial inventado · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
    for (const tab of await page.getByRole("tab").all()) {
      await expect(tab.getByText(await tab.innerText(), { exact: true })).toHaveCSS(
        "font-family",
        /system-ui/,
      );
    }
    await expect(page.getByRole("button", { name: "Ver demo A", exact: true })).toContainText(
      "Sentadilla goblet",
    );
    await page.screenshot({ path: test.info().outputPath(`routines-${theme}.png`) });
    await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
    await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
    await expect(page.getByText("ANTERIOR", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copiar anterior/ })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("27,5");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await expect(page.getByTestId("rest-progress")).toBeVisible();
    await page.getByRole("button", { name: "Sumar 15 segundos", exact: true }).click();
    await expect(
      page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
    ).toHaveText("1:45");
    await page.getByRole("button", { name: "Restar 15 segundos", exact: true }).click();
    await expect(
      page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
    ).toHaveText("1:30");
    for (const width of [360, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByTestId("app-page")
      .filter({ visible: true })
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await page.screenshot({ path: test.info().outputPath(`rest-${theme}.png`) });
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.getByRole("button", { name: "Omitir descanso", exact: true }).click();
    await expect(page.getByTestId("rest-progress")).toHaveCount(0);
  });
}
