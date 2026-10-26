import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek } from "./support/week-fixture";
for (const theme of ["light", "dark"] as const)
  test(`inicio y consulta local ${theme} a 360 px con fecha y sin cumplimiento inventado`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const control = await setupDownloadedWeek(page);
    await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
    await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
    control.offline = true;
    await page.getByRole("button", { name: "Actualizar semana", exact: true }).click();
    await expect(
      page.getByText("El avance se actualizará al conectar.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(
      page.getByText("Semana sin conexión", { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`offline-home-${theme}-360.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
    await expect(page.getByText(/Rutina descargada/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
    ).toBeEnabled();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`offline-routine-${theme}-360.png`),
      fullPage: true,
    });
  });
