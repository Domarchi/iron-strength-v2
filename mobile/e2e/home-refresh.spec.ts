import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";

for (const theme of ["dark", "light"] as const) {
  test(`inicio aprobado, consulta y retomar en una activación · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await expect(page.getByRole("heading", { name: "Tu semana", exact: true })).toBeVisible();
    await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Avance semanal", exact: true }),
    ).toHaveAttribute("aria-valuenow", "0");
    const consult = page.getByRole("button", { name: "Ver rutina A", exact: true });
    expect((await consult.boundingBox())!.y + (await consult.boundingBox())!.height).toBeLessThan(
      520,
    );
    await page.screenshot({ path: test.info().outputPath(`home-${theme}.png`) });
    await consult.click();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        `is:native-training:v1:${downloadId(1)}`,
      ),
    ).toBeNull();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await page.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("42,5");
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    const resume = page.getByRole("button", { name: "Retomar entrenamiento", exact: true });
    await expect(resume).toHaveText("Retomar");
    await expect(consult).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`resume-${theme}.png`) });
    await resume.click();
    await expect(page.getByRole("textbox", { name: "KG serie 1", exact: true })).toHaveValue(
      "42,5",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
  });

  test(`sin programa, futuro y terminado conservan la siguiente acción · ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const control = await setupDownloadedWeek(page);
    let kind: "no_program" | "scheduled" | "finished" = "no_program";
    await page.route("**/api/mobile/v1/week", (route) =>
      route.fulfill({
        json: {
          version: 1,
          kind,
          ...(kind === "no_program"
            ? {}
            : {
                program: {
                  ...control.pack.program,
                  startDate: kind === "scheduled" ? "2026-11-02" : "2026-10-05",
                  endsOn: kind === "scheduled" ? "2026-11-15" : "2026-10-18",
                },
              }),
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    for (const next of ["no_program", "scheduled", "finished"] as const) {
      kind = next;
      await page.getByRole("button", { name: "Actualizar semana", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Tu semana", exact: true })).toBeVisible();
      await expect(
        page.getByRole("progressbar", { name: "Avance semanal", exact: true }),
      ).toHaveCount(0);
      const explore = page.getByRole("button", {
        name: "Explorar rutinas y entrenar",
        exact: true,
      });
      await expect(explore).toBeVisible();
      await expect(explore).toHaveText("Explorar rutinas");
      await expect(page.getByRole("button", { name: "Ver rutina A", exact: true })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Explorar rutinas y entrenar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Entrenar", exact: true })).toBeVisible();
  });
}
