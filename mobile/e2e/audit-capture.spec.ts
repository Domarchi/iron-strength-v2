// T236 · Colector de auditoría visual. Solo corre con AUDIT_CAPTURE=1 (no forma parte de la regresión).
// Usa los fixtures existentes con API simulada: no toca demo, base ni producción.
import { test, type Page } from "@playwright/test";
import path from "node:path";
import { setupDownloadedWeek } from "./support/week-fixture";

const out = process.env.AUDIT_OUT ?? path.resolve(__dirname, "../../docs/design-refresh/audit");
test.skip(process.env.AUDIT_CAPTURE !== "1", "solo auditoría T236");

async function shot(page: Page, name: string, theme: string, width: number) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`) });
}

for (const theme of ["dark", "light"] as const) {
  for (const width of [360, 412]) {
    test(`auditoría semana asignada · ${theme} · ${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== "chromium", "una sola pasada de capturas");
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const metrics: Record<string, number> = {};
      const t0 = Date.now();
      await setupDownloadedWeek(page);
      metrics.loginToHomeMs = Date.now() - t0;
      await shot(page, "01-inicio", theme, width);

      for (const [tab, name] of [
        ["Entrenar", "02-entrenar"],
        ["Historial", "03-historial"],
        ["Progreso", "04-progreso"],
        ["Cuenta", "05-cuenta"],
        ["Inicio", "01b-inicio-volver"],
      ] as const) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await shot(page, name, theme, width);
      }

      await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
      await shot(page, "06-rutina", theme, width);

      let taps = 0;
      await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
      taps++;
      await shot(page, "07-registro-inicial", theme, width);
      await page.getByRole("textbox", { name: "KG serie 1", exact: true }).fill("57,5");
      await page.getByRole("textbox", { name: "REPS serie 1", exact: true }).fill("8");
      taps += 2; // dos campos + el check
      await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
      taps++;
      metrics.tapsToFirstSetFromRoutine = taps;
      await shot(page, "08-registro-descanso", theme, width);

      await page.getByRole("button", { name: "Herramientas del ejercicio", exact: true }).click();
      await shot(page, "09-herramientas", theme, width);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Detalles del ejercicio", exact: true }).click();
      await shot(page, "10-detalles", theme, width);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
      await shot(page, "11-revision-cierre", theme, width);

      await page.evaluate(() => 0);
      console.log(`AUDIT-METRICS ${theme} ${width} ${JSON.stringify(metrics)}`);
    });
  }
}
