import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"] as const) {
  test(`galería del sistema Forja · ${theme}: AA, 360 px y objetivos táctiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/design");
    await expect(page.getByTestId("design-gallery")).toBeVisible();
    await expect(page.getByRole("button", { name: "Primario · Empezar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const bg = await page
      .getByTestId("design-gallery")
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe(theme === "dark" ? "rgb(12, 12, 11)" : "rgb(246, 243, 236)");
    // Todo control interactivo mide al menos 44 px.
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "[role=button],[role=radio],[role=switch],[role=checkbox]",
        ),
      ]
        .map((e) => ({
          n: e.getAttribute("aria-label") ?? e.textContent,
          r: e.getBoundingClientRect(),
        }))
        .filter(
          (x) => x.r.width > 0 && (x.r.height < 43.5 || x.r.width < 43.5) && x.n !== "Cerrar panel",
        )
        .map((x) => `${x.n}: ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    );
    expect(small).toEqual([]);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`gallery-${theme}.png`), fullPage: true });
  });

  test(`hoja, diálogo y menú se abren y cierran con Escape y conservan el foco · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/design");
    await page.getByRole("button", { name: "Abrir hoja" }).click();
    const sheet = page.getByRole("dialog", { name: "Herramientas" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await page.getByRole("button", { name: "Peligro · Eliminar entrenamiento" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Eliminar entrenamiento?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Más opciones" }).first().click();
    const menu = page.getByRole("dialog", { name: "Más opciones" });
    await expect(menu).toBeVisible();
    // La acción de peligro va al final.
    const labels = await menu
      .getByRole("button")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels.at(-1)).toBe("Descartar registro");
    await menu.getByRole("button", { name: "Pausar" }).click();
    await expect(menu).toHaveCount(0);
  });

  test(`controles: segmentado, interruptor, ajuste y aviso breve · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/design");
    await page.getByRole("radio", { name: "Oscuro" }).click();
    await expect(page.getByRole("radio", { name: "Oscuro" })).toBeChecked();
    await page.getByRole("button", { name: "Subir Peso" }).click();
    await expect(page.getByLabel("Peso", { exact: true })).toHaveAttribute(
      "aria-valuetext",
      "60 kg",
    );
    await page.getByRole("button", { name: "Bajar Peso" }).click();
    await page.getByRole("button", { name: "Bajar Peso" }).click();
    await expect(page.getByLabel("Peso", { exact: true })).toHaveAttribute(
      "aria-valuetext",
      "55 kg",
    );
    await page.getByRole("button", { name: "Mostrar aviso breve" }).click();
    await expect(page.getByText("Serie guardada")).toBeVisible();
    await expect(page.getByText("Serie guardada")).toHaveCount(0, { timeout: 6000 });
  });
}
