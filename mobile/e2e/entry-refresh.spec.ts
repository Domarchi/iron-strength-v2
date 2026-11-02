import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek } from "./support/week-fixture";
import { enlargeText, horizontalClipping } from "./support/text-scale";

for (const theme of ["dark", "light"] as const) {
  test(`entrada integrada, foco y contraseña sin perder valores · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Inicia sesión", exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`entry-${theme}.png`) });
    await expect(page.getByTestId("entry-identity")).toBeVisible();
    const email = page.getByLabel("Correo", { exact: true });
    const password = page.getByLabel("Contraseña", { exact: true });
    await email.fill("alumno@example.test");
    await email.press("Enter");
    await expect(password).toBeFocused();
    await password.fill("Acceso-Sintetico-2026!");
    const reveal = page.getByRole("button", { name: "Mostrar contraseña", exact: true });
    const field = await password.boundingBox();
    const toggle = await reveal.boundingBox();
    expect(toggle!.width).toBeGreaterThanOrEqual(48);
    expect(toggle!.x).toBeGreaterThan(field!.x + field!.width - 2);
    expect(toggle!.y).toBeGreaterThanOrEqual(field!.y - 1);
    expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(field!.y + field!.height + 1);
    await reveal.click();
    await expect(password).toHaveJSProperty("type", "text");
    await expect(password).toHaveValue("Acceso-Sintetico-2026!");
    await page.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
    await expect(password).toHaveJSProperty("type", "password");
    await expect(email).toHaveValue("alumno@example.test");
    await expect(page.getByText("PLANIFICA · ENTRENA · PROGRESA", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  });

  test(`acceso con pantalla baja, error real y un solo envío · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    let requests = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/mobile/v1/auth/login", async (route) => {
      requests++;
      await held;
      await route.fulfill({
        status: 401,
        json: {
          version: 1,
          error: { code: "unauthorized", message: "Revisa tu correo y contraseña." },
        },
      });
    });
    await page.goto("/login");
    await page.getByLabel("Correo", { exact: true }).fill("alumno@example.test");
    const password = page.getByLabel("Contraseña", { exact: true });
    await password.fill("Acceso-Sintetico-2026!");
    await password.press("Enter");
    const submit = page.getByRole("button", { name: "Entrar", exact: true });
    await expect(submit).toBeDisabled();
    await expect(password).not.toBeEditable();
    await expect.poll(() => requests).toBe(1);
    release();
    await expect(
      page.getByRole("alert").filter({ hasText: "Revisa tu correo y contraseña." }),
    ).toBeVisible();
    await expect(password).toHaveValue("Acceso-Sintetico-2026!");
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await enlargeText(page);
    await expect(password).toHaveValue("Acceso-Sintetico-2026!");
    await expect(page.getByLabel("Correo", { exact: true })).toHaveValue("alumno@example.test");
    expect(await horizontalClipping(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`entry-low-${theme}.png`) });
  });

  test(`inicio presenta programa y consulta sin iniciar · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await expect(page.getByRole("heading", { name: "Tu semana", exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`home-${theme}.png`) });
    await expect(page.getByTestId("home-identity")).toBeVisible();
    await expect(page.getByText("Entrenar sin conexión", { exact: true })).toBeVisible();
    const consult = page.getByRole("button", { name: "Ver rutina A", exact: true });
    await expect(consult).toBeInViewport();
    expect((await consult.boundingBox())!.y + (await consult.boundingBox())!.height).toBeLessThan(
      520,
    );
    await consult.click();
    await expect(
      page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) => key.startsWith("is:native-training:")).length,
      ),
    ).toBe(0);
  });
}

for (const destination of ["Privacidad y ayuda", "Tengo un enlace de mi coach"] as const) {
  test(`volver desde ${destination} conserva el formulario sin persistir contraseña`, async ({
    page,
  }) => {
    await page.goto("/login");
    const email = page.getByLabel("Correo", { exact: true });
    const password = page.getByLabel("Contraseña", { exact: true });
    await email.fill("alumno@example.test");
    await password.fill("Acceso-Sintetico-2026!");
    await page.getByRole("button", { name: destination, exact: true }).click();
    await page.getByRole("button", { name: "Volver a iniciar sesión", exact: true }).click();
    await expect(email).toHaveValue("alumno@example.test");
    await expect(password).toHaveValue("Acceso-Sintetico-2026!");
    expect(
      await page.evaluate(() =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
          String(value).includes("Acceso-Sintetico-2026!"),
        ),
      ),
    ).toBe(false);
  });
}
