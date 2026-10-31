import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["dark", "light"]) {
  for (const view of ["home", "workout", "routine"]) {
    for (const width of [360, 390, 420]) {
      test(`${theme} ${view} ${width}: lectura, contraste y controles`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 });
        const unexpected: string[] = [];
        await page.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== "http://127.0.0.1:8094" || url.pathname.includes("/api/")) {
            unexpected.push(url.pathname);
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(`/prototype/index.html?view=${view}&theme=${theme}`);
        if (view === "workout") {
          await page
            .getByRole("textbox", { name: "Peso de Sentadilla, serie 1", exact: true })
            .fill("40");
          await page
            .getByRole("textbox", { name: "Repeticiones de Sentadilla, serie 1", exact: true })
            .fill("10");
          await page
            .getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true })
            .click();
          await page
            .getByRole("textbox", { name: "Peso de Remo, serie 1", exact: true })
            .fill("45");
          await page
            .getByRole("textbox", { name: "Repeticiones de Remo, serie 1", exact: true })
            .fill("10");
          await page
            .getByRole("checkbox", { name: "Completar serie 1 de Remo", exact: true })
            .click();
        }
        if (
          width === 390 &&
          info.project.name === "webkit" &&
          process.env.IRON_DESIGN_CAPTURE_DIR
        ) {
          await page.screenshot({
            path: `${process.env.IRON_DESIGN_CAPTURE_DIR}/${theme}-${view}.png`,
          });
        }
        await expect(page.locator("#app")).toHaveAttribute("data-view", view);
        await expect(page.getByText("Propuesta · no guarda", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const small = await page.locator("#app button, #app input").evaluateAll((elements) =>
          elements
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
            })
            .map((element) => element.getAttribute("aria-label") ?? element.textContent),
        );
        expect(small).toEqual([]);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(results.violations).toEqual([]);
        expect(unexpected).toEqual([]);
      });
    }
  }

  test(`${theme}: ronda, descanso y navegación conservan el estado simulado`, async ({ page }) => {
    await page.goto(`/prototype/index.html?theme=${theme}`);
    await page.getByRole("button", { name: "Ver rutina", exact: true }).click();
    await expect(page.locator("#app")).toHaveAttribute("data-view", "routine");
    await expect(
      page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Peso de Sentadilla, serie 1", exact: true })
      .fill("40");
    await page
      .getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Remo", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Completar serie 1 de Remo", exact: true }).click();
    await expect(page.getByRole("timer")).toContainText("1:00");
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    await page.getByRole("button", { name: "Retomar", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Peso de Sentadilla, serie 1", exact: true }),
    ).toHaveValue("40");
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Cambiar tema", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Revisar cierre", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("2 realizadas · 2 pendientes");
    await page.getByRole("button", { name: "Simular envío", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Resumen de prueba", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });

  test(`${theme}: pendientes y errores tienen acciones recuperables`, async ({ page }) => {
    await page.goto(`/prototype/index.html?theme=${theme}&state=pending`);
    await expect(page.getByText("Pendiente de enviar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retomar", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Simular reintento", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Resumen de prueba", exact: true }),
    ).toBeVisible();
    await page.goto(`/prototype/index.html?theme=${theme}&state=error`);
    await expect(page.getByRole("alert")).toContainText("No se pudo enviar");
    await page.getByRole("button", { name: "Simular reintento", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Resumen de prueba", exact: true }),
    ).toBeVisible();
  });

  test(`${theme}: texto ampliado y movimiento reducido`, async ({ page }) => {
    await page.goto(`/prototype/index.html?theme=${theme}&view=workout`);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const overflow = await page.locator("body *").evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            element.getBoundingClientRect().right > 391 ||
            element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
          cls: element.className,
          text: element.textContent?.slice(0, 60),
          right: element.getBoundingClientRect().right,
          width: element.clientWidth,
          scroll: element.scrollWidth,
        })),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      JSON.stringify(overflow),
    ).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Abrir contexto del ejercicio", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Abrir contexto del ejercicio", exact: true }),
    ).toBeFocused();
  });
}
