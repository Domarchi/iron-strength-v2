import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { enterWeekUser, setupDownloadedWeek } from "./support/week-fixture";

test("cambiar tema y movimiento entre pestañas conserva series y descanso", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupDownloadedWeek(page);
  await page.goto("/");
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("27,5");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(
    page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("radio", { name: "Oscuro", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Oscuro", exact: true })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath("account-dark.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrenar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue(
    "27,5",
  );
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("workout-dark.png") });
});

test("volver a Inicio conserva la posición del contenido mientras actualiza la semana", async ({
  page,
}) => {
  await setupDownloadedWeek(page);
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/mobile/v1/week", async (route) => {
    if (++calls > 1) await waiting;
    await route.fallback();
  });
  await page.route("**/api/mobile/v1/workouts", (route) =>
    route.fulfill({
      json: { version: 1, items: [], nextCursor: null },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("/");
  await enterWeekUser(page);
  const action = page.getByRole("button", { name: "Ver rutina A", exact: true });
  await expect(action).toBeVisible();
  const before = await action.boundingBox();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Actualizar historial", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Inicio", exact: true }).click();
  try {
    await expect.poll(() => calls).toBeGreaterThan(1);
    await expect(action).toBeVisible();
    await expect
      .poll(async () => Math.abs((await action.boundingBox())!.y - before!.y))
      .toBeLessThan(2);
    await expect(page.getByLabel("Cargando tu semana")).toHaveCount(0);
  } finally {
    release();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`inicio compacto y detalles de descarga accesibles · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupDownloadedWeek(page);
    await page.goto("/");
    await enterWeekUser(page);
    const action = page.getByRole("button", { name: "Ver rutina A", exact: true });
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.y + (await action.boundingBox())!.height).toBeLessThan(
      600,
    );
    await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Actualizar descarga", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Eliminar descarga", exact: true })).toHaveCount(
      0,
    );
    const details = page.getByRole("button", { name: "Detalles de descarga", exact: true });
    await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("button", { name: "Eliminar descarga", exact: true }),
    ).toBeVisible();
    await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "false");
    for (const width of [360, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.getByTestId("app-page").evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(page.getByRole("heading", { name: "Hola, Ana", exact: true })).toBeInViewport();
      for (const tab of await page.getByRole("tab").all()) {
        const hit = await tab.boundingBox();
        const label = await tab.getByText(await tab.innerText(), { exact: true }).boundingBox();
        expect(hit!.height).toBeGreaterThanOrEqual(44);
        expect(label!.height).toBeGreaterThanOrEqual(14);
        expect(label!.y + label!.height).toBeLessThanOrEqual(hit!.y + hit!.height);
      }
      await page.screenshot({ path: test.info().outputPath(`home-${theme}-${width}.png`) });
    }
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audit.violations).toEqual([]);
  });
}
