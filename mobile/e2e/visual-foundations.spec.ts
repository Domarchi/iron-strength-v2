import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek } from "./support/week-fixture";

for (const theme of ["dark", "light"] as const) {
  test(`fundamentos aprobados y campo numérico conservado · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await expect(page.getByTestId("app-page").filter({ visible: true })).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(11, 12, 14)" : "rgb(250, 250, 250)",
    );
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
    const rest = page.getByRole("textbox", { name: "Descanso habitual en segundos", exact: true });
    await rest.fill("120");
    await expect(rest).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(24, 27, 32)" : "rgb(244, 245, 247)",
    );
    await expect(rest).toBeFocused();
    await expect(rest).toHaveCSS(
      "border-top-color",
      theme === "dark" ? "rgb(152, 190, 255)" : "rgb(32, 88, 189)",
    );
    expect((await rest.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page
      .getByRole("radio", { name: theme === "dark" ? "Claro" : "Oscuro", exact: true })
      .click();
    await expect(rest).toHaveValue("120");
    await expect(rest).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(244, 245, 247)" : "rgb(24, 27, 32)",
    );
    await page.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
    await expect(
      page.getByText("Preferencias guardadas en este dispositivo.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Preferencias de entrenamiento", exact: true }).click();
    await expect(rest).toHaveValue("120");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`foundations-${theme}.png`) });
  });

  test(`botón ocupado conserva etiqueta y rechaza doble envío · ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route("**/api/mobile/v1/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/auth/login")) {
        calls++;
        await waiting;
      }
      await route.fulfill({
        status: 401,
        json: {
          version: 1,
          error: { code: "unauthorized", message: "Acceso de prueba rechazado." },
        },
      });
    });
    await page.goto("/login");
    await page.getByLabel("Correo", { exact: true }).fill("fondos@example.test");
    await page.getByLabel("Contraseña", { exact: true }).fill("Synthetic-password");
    const action = page.getByRole("button", { name: "Entrar", exact: true });
    const before = await action.boundingBox();
    await action.click();
    try {
      await expect.poll(() => calls).toBe(1);
      await expect(action).toBeDisabled();
      await expect(action).toHaveText("Entrar");
      const during = await action.boundingBox();
      expect(Math.abs(during!.height - before!.height)).toBeLessThan(1);
      expect(Math.abs(during!.width - before!.width)).toBeLessThan(1);
    } finally {
      release();
    }
    await expect(page.getByText("Acceso de prueba rechazado.", { exact: true })).toBeVisible();
    await expect(action).toBeEnabled();
    expect(calls).toBe(1);
  });
}
