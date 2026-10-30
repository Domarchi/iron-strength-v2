import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["dark", "light"]) {
  for (const view of ["home", "routine", "workout"]) {
    test(`${theme} ${view}: texto al 200 % en 360 px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      await page.goto(`/prototype/index.html?theme=${theme}&view=${view}`);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  for (const state of ["active", "pending", "error"]) {
    test(`${theme} ${state}: estados secundarios accesibles`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      await page.goto(`/prototype/index.html?theme=${theme}&state=${state}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      await expect(page.getByRole("button", { name: "Retomar", exact: true })).toHaveCount(
        state === "active" ? 1 : 0,
      );
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test(`${theme}: descanso absoluto, pausa y paneles`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-24T15:00:00Z") });
    await page.goto(`/prototype/index.html?theme=${theme}&view=workout`);
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.clock.runFor(15_000);
    await expect(page.getByRole("timer")).toHaveText("0:45");
    await page.getByRole("button", { name: "Abrir contexto del ejercicio", exact: true }).click();
    await page.clock.runFor(15_000);
    await page.getByRole("button", { name: "Cerrar panel", exact: true }).click();
    await expect(page.getByRole("timer")).toHaveText("0:30");
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await page.clock.runFor(30_000);
    await expect(page.getByRole("timer")).toHaveText("0:30");
    await page.getByRole("button", { name: "Agregar 15 segundos", exact: true }).click();
    await expect(page.getByRole("timer")).toHaveText("0:45");
    await page.getByRole("button", { name: "Seguir", exact: true }).click();
    await page.clock.runFor(5_000);
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
    await page.clock.runFor(15_000);
    await page.getByRole("button", { name: "Retomar", exact: true }).click();
    await expect(page.getByRole("timer")).toHaveText("0:25");
    await page.getByRole("button", { name: "Restar 15 segundos", exact: true }).click();
    await expect(page.getByRole("timer")).toHaveText("0:10");
    await page.clock.runFor(15_000);
    await expect(page.getByRole("timer")).toHaveText("0:00");
  });

  test(`${theme}: terminar todas las series no anuncia otro ejercicio`, async ({ page }) => {
    await page.goto(`/prototype/index.html?theme=${theme}&view=workout`);
    for (const series of [1, 2]) {
      for (const exercise of ["Sentadilla", "Remo"]) {
        await page
          .getByRole("checkbox", { name: `Completar serie ${series} de ${exercise}`, exact: true })
          .click();
      }
    }
    await expect(page.getByText("Todas las series completadas", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Revisar cierre", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("4 realizadas · 0 pendientes");
  });

  test(`${theme}: empezar otro entrenamiento no reutiliza series ni descanso`, async ({ page }) => {
    await page.goto(`/prototype/index.html?theme=${theme}&view=workout`);
    await page
      .getByRole("textbox", { name: "Peso de Sentadilla, serie 1", exact: true })
      .fill("42");
    await page
      .getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true })
      .click();
    await page.getByRole("checkbox", { name: "Completar serie 1 de Remo", exact: true }).click();
    await page.getByRole("button", { name: "Revisar cierre", exact: true }).click();
    await page.getByRole("button", { name: "Simular envío", exact: true }).click();
    await page.getByRole("button", { name: "Volver a mi semana", exact: true }).click();
    await page.getByRole("button", { name: "Ver rutina", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Completar serie 1 de Sentadilla", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("textbox", { name: "Peso de Sentadilla, serie 1", exact: true }),
    ).toHaveValue("55");
    await expect(page.getByRole("timer")).toHaveCount(0);
  });
}
