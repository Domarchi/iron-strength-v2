// T236 · Segunda tanda del colector de auditoría (rutas restantes). Solo con AUDIT_CAPTURE=1.
// API simulada y fixtures existentes: no toca demo, base ni producción.
import { test, type Page } from "@playwright/test";
import path from "node:path";
import { setupDownloadedWeek } from "./support/week-fixture";
import { setupTrainingProgress } from "./support/training-progress-fixture";
import { setupCorrection } from "./support/correction-fixture";
import { setupPersonalLibrary } from "./support/library-fixture";
import { setupOwnExercises } from "./support/personal-exercise-fixture";

const out = process.env.AUDIT_OUT ?? path.resolve(__dirname, "../../docs/design-refresh/audit");
test.skip(process.env.AUDIT_CAPTURE !== "1", "solo auditoría T236");
const W = 360;

async function shot(page: Page, name: string, theme: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, `${name}-${theme}-${W}.png`) });
}
/** Cada paso falla por separado: se registra y se sigue con el resto. */
async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.log(`AUDIT-STEP-FAILED ${label}: ${String((e as Error).message).split("\n")[0]}`);
  }
}
async function prep(page: Page, theme: string) {
  await page.setViewportSize({ width: W, height: 844 });
  await page.emulateMedia({ colorScheme: theme as "dark" | "light", reducedMotion: "reduce" });
}

for (const theme of ["dark", "light"] as const) {
  test(`auditoría pública · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    await prep(page, theme);
    await page.route("**/api/mobile/v1/**", (route) =>
      route.fulfill({
        status: 503,
        json: { version: 1, error: { code: "unavailable", message: "Sin servicio de prueba." } },
      }),
    );
    await step("login", async () => {
      await page.goto("/login");
      await shot(page, "20-login", theme);
    });
    await step("acceso", async () => {
      await page.goto(`/access?kind=invite&token=${"a".repeat(43)}`);
      await shot(page, "21-acceso-invitacion", theme);
    });
    await step("recuperar", async () => {
      await page.goto(`/access?kind=recovery&token=${"a".repeat(56)}`);
      await shot(page, "22-acceso-recuperacion", theme);
    });
    await step("privacidad", async () => {
      await page.goto("/privacy");
      await shot(page, "23-privacidad", theme);
    });
  });

  test(`auditoría con historial y progreso · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    await prep(page, theme);
    await setupTrainingProgress(page);
    await step("inicio", () => shot(page, "30-inicio-con-datos", theme));
    await step("historial", async () => {
      await page.getByRole("tab", { name: "Historial", exact: true }).click();
      await shot(page, "31-historial-datos", theme);
    });
    await step("calendario", async () => {
      await page.getByRole("button", { name: "Calendario", exact: true }).click();
      await shot(page, "32-historial-calendario", theme);
      await page.getByRole("button", { name: "Lista", exact: true }).click();
    });
    await step("progreso", async () => {
      await page.getByRole("tab", { name: "Progreso", exact: true }).click();
      await shot(page, "33-progreso-ejercicios", theme);
    });
    await step("progreso-detalle", async () => {
      await page
        .getByRole("button", { name: /^Ver progreso de / })
        .first()
        .click();
      await shot(page, "34-progreso-detalle", theme);
      await page.getByRole("button", { name: /^Volver a mis ejercicios/ }).click();
    });
    await step("progreso-resumen", async () => {
      await page.getByRole("button", { name: "Resumen", exact: true }).click();
      await shot(page, "35-progreso-resumen", theme);
    });
    await step("resultado", async () => {
      await page.getByRole("tab", { name: "Historial", exact: true }).click();
      await page
        .getByRole("button", { name: /^Ver entrenamiento del / })
        .first()
        .click();
      await shot(page, "36-resultado", theme);
    });
    await step("opciones", async () => {
      await page.getByRole("button", { name: "Opciones del entrenamiento", exact: true }).click();
      await shot(page, "37-resultado-opciones", theme);
    });
    await step("repetir", async () => {
      await page.getByRole("button", { name: "Repetir entrenamiento", exact: true }).click();
      await shot(page, "38-repetir-vista-previa", theme);
      await page.goBack();
    });
    await step("guardar-rutina", async () => {
      if (
        !(await page
          .getByRole("dialog", { name: "Opciones del entrenamiento", exact: true })
          .isVisible())
      )
        await page.getByRole("button", { name: "Opciones del entrenamiento", exact: true }).click();
      await page.getByRole("button", { name: /Guardar como rutina|Actualizar mi rutina/ }).click();
      await shot(page, "39-guardar-rutina", theme);
    });
  });

  test(`auditoría corregir y eliminar · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    await prep(page, theme);
    await setupCorrection(page);
    await step("abrir", async () => {
      await page.getByRole("tab", { name: "Historial", exact: true }).click();
      await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
      await page.getByRole("button", { name: "Opciones del entrenamiento", exact: true }).click();
    });
    await step("corregir", async () => {
      await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
      await shot(page, "40-corregir", theme);
      await page.goBack();
    });
    await step("eliminar", async () => {
      if (
        !(await page
          .getByRole("dialog", { name: "Opciones del entrenamiento", exact: true })
          .isVisible())
      )
        await page.getByRole("button", { name: "Opciones del entrenamiento", exact: true }).click();
      await page.getByRole("button", { name: "Eliminar entrenamiento", exact: true }).click();
      await shot(page, "41-eliminar", theme);
    });
  });

  test(`auditoría biblioteca y editor · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    await prep(page, theme);
    await setupPersonalLibrary(page);
    await step("mis-rutinas", () => shot(page, "53-mis-rutinas", theme));
    await step("editor", async () => {
      await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
        .fill("Superior");
      await shot(page, "54-editor-vacio", theme);
      await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
      await shot(page, "55-selector-ejercicios", theme);
      await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
      await page
        .getByRole("checkbox", { name: "Seleccionar Remo con mancuerna", exact: true })
        .check();
      await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
      await shot(page, "56-editor-con-ejercicios", theme);
    });
  });

  test(`auditoría catálogo · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    test.setTimeout(60000);
    await prep(page, theme);
    await setupPersonalLibrary(page);
    await step("catalogo", async () => {
      await page.goBack();
      await page
        .getByRole("button", { name: "Biblioteca de ejercicios", exact: true })
        .click({ timeout: 8000 });
      await shot(page, "51-catalogo", theme);
    });
    await step("ficha", async () => {
      await page
        .getByRole("button", { name: /^Ver ficha de |^Abrir |^Historial de / })
        .first()
        .click({ timeout: 8000 });
      await shot(page, "52-ficha-ejercicio", theme);
    });
  });

  test(`auditoría mis ejercicios · ${theme}`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "una sola pasada");
    await prep(page, theme);
    await setupOwnExercises(page);
    await step("lista", () => shot(page, "60-mis-ejercicios", theme));
    await step("form", async () => {
      await page.getByRole("button", { name: "Nuevo ejercicio", exact: true }).click();
      await shot(page, "61-ejercicio-nuevo", theme);
    });
  });
}
